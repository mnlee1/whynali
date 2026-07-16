/**
 * 카드뉴스 자동화 파이프라인
 *
 * 콘텐츠 모드 (KST 요일 기반 자동 선택):
 *   월 — 주말 핫이슈 TOP 3
 *   화 — 급상승 이슈 단독
 *   수 — 이번주 핫이슈 TOP 3
 *   목 — 분야별 핫이슈 (정치·경제·사회·연예)
 *   금 — 이슈 타임라인 (종결 이슈 심층)
 *
 * 수동 모드 (--mode 플래그):
 *   --mode=qa      --issue-id=<uuid>   Q&A형
 *   --mode=debate  --issue-id=<uuid>   찬반형
 *   --mode=surging --issue-id=<uuid>   급상승형 (특정 이슈 지정)
 *   --mode=timeline --issue-id=<uuid>  타임라인 (특정 이슈 지정)
 *   --draft-id=<uuid>                  관리자 페이지에서 수정한 텍스트 draft 사용 (AI 재생성 스킵, --issue-id와 함께 사용)
 *
 * 실행: npx tsx scripts/card-news/pipeline.ts
 * 실제 업로드: npx tsx scripts/card-news/pipeline.ts --publish
 * 모드 강제: npx tsx scripts/card-news/pipeline.ts --mode=qa --issue-id=xxx
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { chromium } from 'playwright'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { TwitterApi } from 'twitter-api-v2'

import {
  type ContentMode,
  type Issue,
  type ClosedIssue,
  type SlideContent,
  getLogoBase64,
  getTemplateHtml,
  fillTemplate,
  fetchRecentlyUsedIssueIds,
  fetchTopIssues,
  fetchWeekendTopIssues,
  fetchSurgingIssue,
  fetchCategoryTopIssues,
  fetchClosedIssueTimeline,
  generateTop3Slides,
  generateSurgingSlides,
  generateCategorySlides,
  generateTimelineSlides,
  generateQASlides,
  generateDebateSlides,
  generateNumbersSlides,
  generateSlidesForIssue,
  fetchCardNewsDraft,
  markCardNewsDraftUsed,
  resetFallbackTracking,
  getFallbackCount,
} from '../../lib/card-news/core'
import { sendDoorayCardNewsQualityGateAlert } from '../../lib/dooray-notification'

// ─── 설정 ──────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const IG_USER_ID = process.env.IG_USER_ID
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN
const THREADS_USER_ID = process.env.THREADS_USER_ID
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN
const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET

const ASSETS_DIR = path.join(__dirname, 'assets')
const FOLLOW_SLIDE_PATH = path.join(ASSETS_DIR, 'slide-follow.png')
const OUTPUT_DIR = path.join(__dirname, 'output')
const PUBLISH = process.argv.includes('--publish')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── 모드 감지 ──────────────────────────────────────────

function getContentMode(): ContentMode {
  const modeArg = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1]
  if (modeArg) return modeArg as ContentMode

  // KST 요일: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
  const dayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()
  const modeMap: Record<number, ContentMode> = {
    1: 'weekend-recap',
    2: 'surging',
    3: 'by-category',
    4: 'by-numbers',
    5: 'timeline',
  }
  return modeMap[dayKST] ?? 'weekly-top3'
}

function getIssueIdArg(): string | null {
  return process.argv.find(a => a.startsWith('--issue-id='))?.split('=')[1] ?? null
}

function getDraftIdArg(): string | null {
  return process.argv.find(a => a.startsWith('--draft-id='))?.split('=')[1] ?? null
}

// ─── 메인 ──────────────────────────────────────────────

async function run() {
  const mode = getContentMode()
  const issueIdArg = getIssueIdArg()
  const draftIdArg = getDraftIdArg()
  console.log(`🚀 카드뉴스 파이프라인 시작 (모드: ${mode}${issueIdArg ? `, 이슈: ${issueIdArg}` : ''}${draftIdArg ? `, draft: ${draftIdArg}` : ''})`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  resetFallbackTracking()

  const LOGO_BASE64 = getLogoBase64()

  // 1. 슬라이드 콘텐츠 생성
  let slideContents: SlideContent[]
  let reportIssues: Issue[] = []
  let closedIssue: ClosedIssue | null = null

  // 수동 모드: 특정 이슈 ID로 단일 이슈 생성
  if (issueIdArg && ['surging', 'timeline', 'qa', 'debate', 'by-numbers'].includes(mode)) {
    console.log(`ℹ️  수동 모드 — 이슈 ID: ${issueIdArg}`)
    if (draftIdArg) {
      const draftSlides = await fetchCardNewsDraft(draftIdArg)
      if (!draftSlides) throw new Error(`draft를 찾을 수 없습니다: ${draftIdArg}`)
      slideContents = draftSlides
      console.log('ℹ️  관리자 수정 draft 사용 — AI 텍스트 재생성 스킵')
    } else {
      slideContents = await generateSlidesForIssue(issueIdArg, mode as 'surging' | 'timeline' | 'qa' | 'debate', LOGO_BASE64)
    }
    const { data: issueData } = await supabase
      .from('issues')
      .select('id, title, category, heat_index, topic')
      .eq('id', issueIdArg)
      .single()
    if (issueData) reportIssues = [issueData as Issue]
    console.log(`✅ 슬라이드 콘텐츠 ${slideContents.length}개 생성 완료`)
  } else {
    // 자동 모드: DB에서 이슈 선택
    const usedIssueIds = await fetchRecentlyUsedIssueIds()
    console.log(`ℹ️  최근 7일 사용 이슈 ${usedIssueIds.size}개 제외`)

    let issues: Issue[] = []
    let effectiveMode = mode

    if (mode === 'weekend-recap') {
      issues = await fetchWeekendTopIssues(usedIssueIds)
    } else if (mode === 'surging') {
      const issue = await fetchSurgingIssue(usedIssueIds)
      if (issue) {
        issues = [issue]
      } else {
        issues = await fetchTopIssues(usedIssueIds)
        effectiveMode = 'weekly-top3'
        console.warn('⚠️  급상승 이슈 없음, weekly-top3로 대체')
      }
    } else if (mode === 'weekly-top3') {
      issues = await fetchTopIssues(usedIssueIds)
    } else if (mode === 'by-numbers') {
      const topIssues = await fetchTopIssues(usedIssueIds)
      if (topIssues.length > 0) {
        issues = [topIssues[0]]
      } else {
        issues = await fetchTopIssues()
        effectiveMode = 'weekly-top3'
        console.warn('⚠️  숫자형 이슈 없음, weekly-top3로 대체')
      }
    } else if (mode === 'by-category') {
      issues = await fetchCategoryTopIssues(usedIssueIds)
    } else if (mode === 'timeline') {
      closedIssue = await fetchClosedIssueTimeline(usedIssueIds)
      if (!closedIssue) {
        issues = await fetchTopIssues(usedIssueIds)
        effectiveMode = 'weekly-top3'
        console.warn('⚠️  타임라인 이슈 없음, weekly-top3로 대체')
      }
    }

    if (effectiveMode !== 'timeline' && issues.length === 0) {
      issues = await fetchTopIssues()
      effectiveMode = 'weekly-top3'
      console.warn('⚠️  이슈 없음 (중복 제외 후), excludeIds 없이 weekly-top3 대체')
    }

    reportIssues = effectiveMode === 'timeline' && closedIssue ? [closedIssue] : issues

    const fetchedLabel = effectiveMode === 'timeline'
      ? `타임라인 이슈 1개 (${closedIssue!.title})`
      : `이슈 ${issues.length}개`
    console.log(`✅ 데이터 조회 완료: ${fetchedLabel}`)

    switch (effectiveMode) {
      case 'weekend-recap':
        slideContents = await generateTop3Slides(issues, LOGO_BASE64, '주말 핫이슈')
        break
      case 'surging':
        slideContents = await generateSurgingSlides(issues[0], LOGO_BASE64)
        break
      case 'weekly-top3':
        slideContents = await generateTop3Slides(issues, LOGO_BASE64)
        break
      case 'by-numbers':
        slideContents = await generateNumbersSlides(issues[0], LOGO_BASE64)
        break
      case 'by-category':
        slideContents = await generateCategorySlides(issues, LOGO_BASE64)
        break
      case 'timeline':
        slideContents = await generateTimelineSlides(closedIssue!, LOGO_BASE64)
        break
      default:
        slideContents = await generateTop3Slides(issues, LOGO_BASE64)
    }

    console.log(`✅ 슬라이드 콘텐츠 ${slideContents.length}개 생성 완료`)
  }

  // 2. PNG 이미지 생성
  const imagePaths = await renderSlides(slideContents)
  console.log(`✅ 이미지 ${imagePaths.length}장 생성 완료`)
  console.log('   저장 경로:', OUTPUT_DIR)

  if (draftIdArg) {
    await markCardNewsDraftUsed(draftIdArg)
  }

  // X(Twitter) 캡션 파일 저장 (수동 게시용)
  const xCaption = buildCaption(mode, reportIssues, closedIssue, 'twitter')
  const xCaptionPath = path.join(OUTPUT_DIR, 'x-caption.txt')
  fs.writeFileSync(xCaptionPath, xCaption, 'utf-8')
  console.log('\n📋 X(Twitter) 캡션 저장:', xCaptionPath)
  console.log('─'.repeat(40))
  console.log(xCaption)
  console.log('─'.repeat(40))

  if (!PUBLISH) {
    console.log('ℹ️  테스트 모드: --publish 플래그 없음, 업로드 스킵')
    console.log('🎉 완료!')
    return
  }

  // 자동 품질 게이트 — 사람 검수 없이 자동 발행되는 구조는 유지하되, 생성 중 폴백(AI 텍스트
  // 검증 실패)이 하나라도 섞였으면 자동 발행만 건너뛴다. 이미지는 이미 생성돼 CI 아티팩트로
  // 남으니, draft로 관리자가 고쳐서 수동 발행하면 된다.
  const fallbackCount = getFallbackCount()
  if (fallbackCount > 0) {
    console.error(`🚧 품질 게이트: 생성 중 폴백 ${fallbackCount}건 발생 — 자동 발행을 건너뜁니다.`)
    await sendDoorayCardNewsQualityGateAlert({
      mode,
      issueTitle: reportIssues[0]?.title ?? closedIssue?.title ?? '(제목 없음)',
      fallbackCount,
      outputDir: OUTPUT_DIR,
    })
    console.log('🎉 완료! (발행은 보류됨)')
    return
  }

  // 3. SNS 자동 업로드
  const uploadResults: string[] = []
  let igPostId: string | null = null
  let threadsPostId: string | null = null
  const igCaption = buildCaption(mode, reportIssues, closedIssue, 'instagram')
  const threadsCaption = buildCaption(mode, reportIssues, closedIssue, 'threads')

  if (IG_USER_ID && IG_ACCESS_TOKEN) {
    try {
      igPostId = await uploadToInstagram(imagePaths, igCaption)
      console.log('✅ Instagram 업로드 완료')
      uploadResults.push('Instagram ✓')
    } catch (err) {
      console.error('❌ Instagram 업로드 실패:', (err as Error).message)
      uploadResults.push('Instagram ✗')
    }
  }

  if (THREADS_USER_ID && THREADS_ACCESS_TOKEN) {
    try {
      threadsPostId = await uploadToThreads(imagePaths, threadsCaption)
      console.log('✅ Threads 업로드 완료')
      uploadResults.push('Threads ✓')
    } catch (err) {
      console.error('❌ Threads 업로드 실패:', (err as Error).message)
      uploadResults.push('Threads ✗')
    }
  }

  console.log('\n📊 업로드 결과:')
  uploadResults.forEach((result) => console.log(`   ${result}`))

  // DB 발행 로그
  const { error: logError } = await supabase.from('card_news_logs').insert({
    mode,
    issues: reportIssues.map(i => ({ id: i.id, title: i.title, category: i.category, heat_index: i.heat_index })),
    tags_instagram: igCaption.split('\n').pop(),
    tags_threads: threadsCaption.split('\n').pop(),
    slide_count: imagePaths.length,
    ig_post_id: igPostId,
    threads_post_id: threadsPostId,
    ig_success: igPostId !== null,
    threads_success: threadsPostId !== null,
  })
  if (logError) console.warn('⚠️  DB 로그 저장 실패 (무시):', logError.message)
  else console.log('   DB 로그 저장 완료')

  const resultLog = {
    timestamp: new Date().toISOString(),
    mode,
    issues: reportIssues.map(i => ({ id: i.id, title: i.title, category: i.category, heat_index: i.heat_index })),
    slides: imagePaths.length,
    ig_post_id: igPostId,
    threads_post_id: threadsPostId,
    results: uploadResults,
  }
  const logPath = path.join(OUTPUT_DIR, 'result-log.json')
  const existing = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf-8')) : []
  existing.unshift(resultLog)
  fs.writeFileSync(logPath, JSON.stringify(existing.slice(0, 20), null, 2))

  console.log('\n🎉 완료!')
}

// ─── HTML → PNG 렌더링 ────────────────────────────────────

async function renderSlides(slides: SlideContent[]): Promise<string[]> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const imagePaths: string[] = []

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const outputPath = path.join(OUTPUT_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`)

      if (slide.type === 'follow' && fs.existsSync(FOLLOW_SLIDE_PATH)) {
        fs.copyFileSync(FOLLOW_SLIDE_PATH, outputPath)
        imagePaths.push(outputPath)
        console.log(`   slide-${i + 1} 저장됨 (고정 이미지)`)
        continue
      }

      const template = getTemplateHtml(slide.type)
      const html = fillTemplate(template, slide)

      const page = await browser.newPage()
      await page.setViewportSize({ width: 1080, height: 1350 })
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 15000 })
      await page.screenshot({ path: outputPath, type: 'png', fullPage: false })
      await page.close()

      imagePaths.push(outputPath)
      console.log(`   slide-${i + 1} 저장됨`)
    }
  } finally {
    await browser.close()
  }

  return imagePaths
}

// ─── 캡션 생성 ────────────────────────────────────────────

const CATEGORY_TAGS: Record<string, string[]> = {
  '정치': ['#정치', '#정치이슈'],
  '경제': ['#경제', '#경제이슈'],
  '사회': ['#사회', '#사회이슈'],
  '연예': ['#연예', '#연예이슈'],
  '스포츠': ['#스포츠', '#스포츠이슈'],
  '기술': ['#IT', '#IT이슈'],
}

function extractKeywordTags(issues: Issue[], maxPerIssue = 3): string[] {
  const tags: string[] = []
  for (const issue of issues) {
    const words = (issue.topic ?? issue.title)
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, maxPerIssue)
    tags.push(...words.map(w => `#${w}`))
  }
  return tags
}

function buildTags(mode: ContentMode, issues: Issue[]): string {
  const base = ['#왜난리', '#이슈', '#뉴스', '#한국뉴스', '#카드뉴스']
  const categoryTags = Array.from(new Set(issues.map(i => i.category)))
    .flatMap(cat => CATEGORY_TAGS[cat] ?? [])
  const keywordTags = extractKeywordTags(issues, issues.length === 1 ? 5 : 3)
  const modeTag: Partial<Record<ContentMode, string>> = {
    'weekend-recap': '#주간핫이슈',
    'surging':       '#실시간이슈',
    'weekly-top3':   '#TOP3',
    'by-category':   '#분야별이슈',
    'by-numbers':    '#숫자로보는이슈',
    'timeline':      '#이슈타임라인',
    'qa':            '#왜난리야',
    'debate':        '#찬반논란',
  }
  return Array.from(new Set([...base, ...categoryTags, ...keywordTags, modeTag[mode] ?? ''])).join(' ')
}

function buildCaption(
  mode: ContentMode,
  issues: Issue[],
  closedIssue: ClosedIssue | null,
  platform: 'instagram' | 'threads' | 'twitter' = 'instagram'
): string {
  const utm = `utm_source=${platform}&utm_medium=cardnews`
  const mainUrl = `https://whynali.com/?${utm}`
  const issueUrl = (id: string) => `https://whynali.com/i/${id}?${utm}`
  const tags = platform === 'threads' ? '' : platform === 'twitter' ? '#왜난리 #이슈' : buildTags(mode, issues)
  const issue = issues[0]
  const engagementCta = platform === 'instagram'
    ? '🔥이슈에 대해 궁금하시면, 🎈팔로우하고 💬댓글 남겨주세요!'
    : null

  switch (mode) {
    case 'weekend-recap': {
      const lines = issues.map((i, idx) => `${idx + 1}위 "${i.title}"`)
      const cta = `왜난리인지 직접 확인 👉 ${mainUrl}`
      return ['이번 주 뭐가 터졌나요? 🔥', '', ...lines, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'surging': {
      const surge = issue?.surgePct ? ` (▲${Math.round(issue.surgePct)}%)` : ''
      const cta = `왜난리인지 직접 확인 👉 ${issueUrl(issue.id)}`
      return [`지금 이 이슈 모르면 대화 못 낍니다 🚨`, '', `"${issue?.title}"${surge}`, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'weekly-top3': {
      const lines = issues.map((i, idx) => `${idx + 1}위 "${i.title}"`)
      const cta = `왜난리인지 직접 확인 👉 ${mainUrl}`
      return ['이번 주 TOP 3, 다 알고 계신가요? 🔥', '', ...lines, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'by-category': {
      const lines = issues.map(i => `[${i.category}] "${i.title}"`)
      const cta = `왜난리인지 직접 확인 👉 ${mainUrl}`
      return ['오늘 뭐가 터졌나 — 분야별 정리 📋', '', ...lines, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'timeline': {
      const targetIssue = closedIssue ?? issue
      const cta = `왜난리인지 직접 확인 👉 ${issueUrl(targetIssue.id)}`
      return ['이 이슈, 처음부터 끝까지 정리했습니다 📌', '', `"${targetIssue?.title}"`, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'by-numbers': {
      const cta = `왜난리인지 직접 확인 👉 ${issueUrl(issue.id)}`
      return [`이 이슈, 숫자로 읽으면 다 보여요 🔢`, '', `"${issue?.title}"`, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'qa': {
      const cta = `왜난리인지 직접 확인 👉 ${issueUrl(issue.id)}`
      return [`이게 왜 난리야? Q&A로 정리했습니다 🤔`, '', `"${issue?.title}"`, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
    case 'debate': {
      const cta = `왜난리인지 직접 확인 👉 ${issueUrl(issue.id)}`
      return [`찬반 논란, 양쪽 다 들어보세요 ⚖️`, '', `"${issue?.title}"`, ...(engagementCta ? ['', engagementCta] : []), '', cta, ...(tags ? ['', tags] : [])].join('\n')
    }
  }
}

// ─── Instagram 업로드 ────────────────────────────────────

async function uploadToInstagram(imagePaths: string[], caption: string): Promise<string> {
  const { urls: imageUrls, fileNames } = await uploadImagesToStorage(imagePaths)

  try {
    const mediaIds: string[] = []
    for (const imageUrl of imageUrls) {
      const res = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url: imageUrl, is_carousel_item: 'true', access_token: IG_ACCESS_TOKEN! }),
      })
      const json = (await res.json()) as { id?: string; error?: { message: string } }
      if (!json.id) throw new Error(`미디어 컨테이너 생성 실패: ${JSON.stringify(json.error)}`)
      mediaIds.push(json.id)
    }

    for (const mediaId of mediaIds) {
      let attempts = 0
      while (attempts < 15) {
        await new Promise(r => setTimeout(r, 4000))
        const s = (await (await fetch(`https://graph.instagram.com/v21.0/${mediaId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`)).json()) as { status_code?: string }
        if (s.status_code === 'FINISHED') break
        if (s.status_code === 'ERROR') throw new Error(`미디어 처리 오류: ${mediaId}`)
        attempts++
      }
      if (attempts >= 15) throw new Error(`미디어 처리 타임아웃: ${mediaId}`)
    }

    const carouselRes = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'CAROUSEL', children: mediaIds.join(','), caption, access_token: IG_ACCESS_TOKEN! }),
    })
    const carousel = (await carouselRes.json()) as { id?: string; error?: { message: string } }
    if (!carousel.id) throw new Error(`캐러셀 생성 실패: ${carousel.error?.message}`)

    let ca = 0
    while (ca < 15) {
      await new Promise(r => setTimeout(r, 4000))
      const s = (await (await fetch(`https://graph.instagram.com/v21.0/${carousel.id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`)).json()) as { status_code?: string }
      if (s.status_code === 'FINISHED') break
      if (s.status_code === 'ERROR') throw new Error('캐러셀 처리 오류')
      ca++
    }
    if (ca >= 15) throw new Error('캐러셀 처리 타임아웃')

    const pub = (await (await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: carousel.id, access_token: IG_ACCESS_TOKEN! }),
    })).json()) as { id?: string; error?: { message: string } }
    if (!pub.id) throw new Error(`발행 실패: ${pub.error?.message}`)
    return pub.id
  } finally {
    await deleteFromStorage(fileNames)
  }
}

// ─── Threads 업로드 ──────────────────────────────────────

async function uploadToThreads(imagePaths: string[], caption: string): Promise<string> {
  const { urls: imageUrls, fileNames } = await uploadImagesToStorage(imagePaths)

  try {
    const itemIds: string[] = []
    for (const imageUrl of imageUrls) {
      const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, {
        method: 'POST',
        body: new URLSearchParams({ media_type: 'IMAGE', image_url: imageUrl, is_carousel_item: 'true', access_token: THREADS_ACCESS_TOKEN! }),
      })
      const json = (await res.json()) as { id?: string; error?: { message: string } }
      if (!json.id) throw new Error(`Threads 아이템 컨테이너 생성 실패: ${json.error?.message}`)
      itemIds.push(json.id)
    }

    await new Promise(r => setTimeout(r, 10000))

    const carouselRes = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'CAROUSEL', children: itemIds.join(','), text: caption, access_token: THREADS_ACCESS_TOKEN! }),
    })
    const carousel = (await carouselRes.json()) as { id?: string; error?: { message: string } }
    if (!carousel.id) throw new Error(`Threads 캐러셀 생성 실패: ${JSON.stringify(carousel)}`)

    await new Promise(r => setTimeout(r, 30000))

    const pub = (await (await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: carousel.id, access_token: THREADS_ACCESS_TOKEN! }),
    })).json()) as { id?: string; error?: { message: string } }
    if (!pub.id) throw new Error(`Threads 발행 실패: ${pub.error?.message}`)
    return pub.id
  } finally {
    await deleteFromStorage(fileNames)
  }
}

// ─── Storage ─────────────────────────────────────────────

async function uploadImagesToStorage(imagePaths: string[]): Promise<{ urls: string[]; fileNames: string[] }> {
  const urls: string[] = []
  const fileNames: string[] = []
  const ts = Date.now()

  for (const imagePath of imagePaths) {
    const fileName = `card-news/${ts}-${path.basename(imagePath)}`
    const { error } = await supabase.storage
      .from('cardnews')
      .upload(fileName, fs.readFileSync(imagePath), { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)
    const { data } = supabase.storage.from('cardnews').getPublicUrl(fileName)
    urls.push(data.publicUrl)
    fileNames.push(fileName)
  }

  return { urls, fileNames }
}

async function deleteFromStorage(fileNames: string[]): Promise<void> {
  const { error } = await supabase.storage.from('cardnews').remove(fileNames)
  if (error) console.warn('Storage 삭제 실패 (무시):', error.message)
}

// ─── 실행 ────────────────────────────────────────────────

run().catch((err) => {
  console.error('❌ 오류:', err.message)
  process.exit(1)
})
