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
 * 실행: npx tsx scripts/card-news/pipeline.ts
 * 실제 업로드: npx tsx scripts/card-news/pipeline.ts --publish
 * 모드 강제: npx tsx scripts/card-news/pipeline.ts --mode surging
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { chromium } from 'playwright'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import { TwitterApi } from 'twitter-api-v2'

// ─── 설정 ──────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY!.split(',')[0].trim()

const IG_USER_ID = process.env.IG_USER_ID
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN
const THREADS_USER_ID = process.env.THREADS_USER_ID
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN
const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET

const TEMPLATE_DIR = path.join(__dirname, 'templates')
const OUTPUT_DIR = path.join(__dirname, 'output')
const PUBLISH = process.argv.includes('--publish')

const LOGO_PATH = path.join(__dirname, '../../public/whynali-logo.png')
const LOGO_BASE64 = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const groq = new Groq({ apiKey: GROQ_API_KEY })

// ─── 타입 ──────────────────────────────────────────────

type ContentMode = 'weekend-recap' | 'surging' | 'weekly-top3' | 'by-category' | 'timeline'

interface Issue {
  id: string
  title: string
  category: string
  thumbnail_urls?: string[] | null
  primary_thumbnail_index?: number | null
  heat_index: number | null
  heat_index_1h_ago?: number | null
  surgePct?: number
  topic?: string | null
  topic_description?: string | null
  brief_summary?: { intro: string; bullets: string[]; conclusion: string } | null
}

interface TimelinePoint {
  stage: string
  title: string
  occurred_at: string
}

interface ClosedIssue extends Issue {
  timelinePoints: TimelinePoint[]
}

interface SlideContent {
  type: 'cover' | 'body' | 'badge' | 'follow'
  main_title?: string
  sub_title?: string
  desc?: string
  point_text_01?: string
  point_text_02?: string
  bg_image_url?: string
  logo_image_url?: string
}

// ─── 모드 감지 ──────────────────────────────────────────

function getContentMode(): ContentMode {
  const modeArg = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1]
  if (modeArg) return modeArg as ContentMode

  // KST 요일: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
  const dayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()
  const modeMap: Record<number, ContentMode> = {
    1: 'weekend-recap',
    2: 'surging',
    3: 'weekly-top3',
    4: 'by-category',
    5: 'timeline',
  }
  return modeMap[dayKST] ?? 'weekly-top3'
}

// ─── 메인 ──────────────────────────────────────────────

async function run() {
  const mode = getContentMode()
  console.log(`🚀 카드뉴스 파이프라인 시작 (모드: ${mode})`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // 1. 데이터 조회 (fallback 시 effectiveMode 변경)
  let issues: Issue[] = []
  let closedIssue: ClosedIssue | null = null
  let effectiveMode = mode

  if (mode === 'weekend-recap') {
    issues = await fetchWeekendTopIssues()
  } else if (mode === 'surging') {
    const issue = await fetchSurgingIssue()
    if (issue) {
      issues = [issue]
    } else {
      issues = await fetchTopIssues()
      effectiveMode = 'weekly-top3'
      console.warn('⚠️  급상승 이슈 없음, weekly-top3로 대체')
    }
  } else if (mode === 'weekly-top3') {
    issues = await fetchTopIssues()
  } else if (mode === 'by-category') {
    issues = await fetchCategoryTopIssues()
  } else if (mode === 'timeline') {
    closedIssue = await fetchClosedIssueTimeline()
    if (!closedIssue) {
      issues = await fetchTopIssues()
      effectiveMode = 'weekly-top3'
      console.warn('⚠️  타임라인 이슈 없음, weekly-top3로 대체')
    }
  }

  if (effectiveMode !== 'timeline' && issues.length === 0) {
    issues = await fetchTopIssues()
    effectiveMode = 'weekly-top3'
    console.warn('⚠️  이슈 없음, weekly-top3로 대체')
  }

  const fetchedLabel = effectiveMode === 'timeline'
    ? `타임라인 이슈 1개 (${closedIssue!.title})`
    : `이슈 ${issues.length}개`
  console.log(`✅ 데이터 조회 완료: ${fetchedLabel}`)

  // 2. 슬라이드 콘텐츠 생성
  let slideContents: SlideContent[]

  switch (effectiveMode) {
    case 'weekend-recap':
      slideContents = await generateTop3Slides(issues, '주말 핫이슈')
      break
    case 'surging':
      slideContents = await generateSurgingSlides(issues[0])
      break
    case 'weekly-top3':
      slideContents = await generateTop3Slides(issues)
      break
    case 'by-category':
      slideContents = await generateCategorySlides(issues)
      break
    case 'timeline':
      slideContents = await generateTimelineSlides(closedIssue!)
      break
  }

  console.log(`✅ 슬라이드 콘텐츠 ${slideContents.length}개 생성 완료`)

  // 3. PNG 이미지 생성
  const imagePaths = await renderSlides(slideContents)
  console.log(`✅ 이미지 ${imagePaths.length}장 생성 완료`)
  console.log('   저장 경로:', OUTPUT_DIR)

  if (!PUBLISH) {
    console.log('ℹ️  테스트 모드: --publish 플래그 없음, 업로드 스킵')
    console.log('🎉 완료!')
    return
  }

  // 4. SNS 자동 업로드
  const uploadResults: string[] = []
  let igPostId: string | null = null
  let threadsPostId: string | null = null
  const igCaption = buildCaption(effectiveMode, issues, closedIssue, 'instagram')
  const threadsCaption = buildCaption(effectiveMode, issues, closedIssue, 'threads')

  if (IG_USER_ID && IG_ACCESS_TOKEN) {
    try {
      igPostId = await uploadToInstagram(imagePaths, igCaption)
      console.log('✅ Instagram 업로드 완료')
      uploadResults.push('Instagram ✓')
    } catch (err) {
      console.error('❌ Instagram 업로드 실패:', (err as Error).message)
      uploadResults.push('Instagram ✗')
    }
  } else {
    console.warn('⚠️  Instagram: 환경 변수 없음 (IG_USER_ID, IG_ACCESS_TOKEN)')
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
  } else {
    console.warn('⚠️  Threads: 환경 변수 없음 (THREADS_USER_ID, THREADS_ACCESS_TOKEN)')
  }

  // Twitter(X) — 무료 플랜 게시 불가 (Basic $100/월 필요)
  // if (TWITTER_API_KEY && ...) { ... }

  console.log('\n📊 업로드 결과:')
  uploadResults.forEach((result) => console.log(`   ${result}`))

  // 발행 로그 DB 저장 (post_id 보존 → 나중에 Insights API 조회용)
  const reportIssues = effectiveMode === 'timeline' && closedIssue ? [closedIssue] : issues
  const { error: logError } = await supabase.from('card_news_logs').insert({
    mode: effectiveMode,
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

  // 로컬 이력도 유지
  const resultLog = {
    timestamp: new Date().toISOString(),
    mode: effectiveMode,
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
  console.log(`   로컬 이력 저장: ${logPath}`)

  console.log('\n🎉 완료!')
}

// ─── 1. Supabase 데이터 조회 ────────────────────────────

async function fetchTopIssues(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description, brief_summary')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(3)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)
  return data || []
}

// 월요일: 직전 금~일 동안 업데이트된 이슈 중 heat_index 상위 3개
async function fetchWeekendTopIssues(): Promise<Issue[]> {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description, brief_summary')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .is('merged_into_id', null)
    .gte('updated_at', since)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(3)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)

  const result = (data || []) as Issue[]
  if (result.length >= 3) return result

  // 주말 이슈 부족 시 전체 top으로 보충
  const fallback = await fetchTopIssues()
  const existing = new Set(result.map(i => i.id))
  return [...result, ...fallback.filter(i => !existing.has(i.id))].slice(0, 3)
}

// 화요일: surgePct 기준 1위 이슈
async function fetchSurgingIssue(): Promise<Issue | null> {
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, heat_index_1h_ago, topic, topic_description, brief_summary')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .not('heat_index_1h_ago', 'is', null)
    .gt('heat_index_1h_ago', 0)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)

  const candidates = (data || []) as Issue[]
  const withSurge = candidates
    .map(i => ({
      ...i,
      surgePct: ((i.heat_index ?? 0) - (i.heat_index_1h_ago ?? 0)) / (i.heat_index_1h_ago ?? 1) * 100,
    }))
    .filter(i => i.surgePct > 0)
    .sort((a, b) => b.surgePct - a.surgePct)

  return withSurge[0] ?? (candidates[0] ? { ...candidates[0], surgePct: 0 } : null)
}

// 목요일: 카테고리별 heat_index 1위
const CARD_NEWS_CATEGORIES = ['정치', '경제', '사회', '연예'] as const

async function fetchCategoryTopIssues(): Promise<Issue[]> {
  const results: Issue[] = []
  for (const cat of CARD_NEWS_CATEGORIES) {
    const { data } = await supabase
      .from('issues')
      .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description, brief_summary')
      .eq('approval_status', '승인')
      .eq('visibility_status', 'visible')
      .neq('status', '종결')
      .is('merged_into_id', null)
      .eq('category', cat)
      .order('heat_index', { ascending: false, nullsFirst: false })
      .limit(1)
    if (data && data.length > 0) results.push(data[0] as Issue)
  }
  return results
}

// 금요일: 이번주 종결 이슈 중 timeline_points가 2개 이상인 것
async function fetchClosedIssueTimeline(): Promise<ClosedIssue | null> {
  const queries = [
    new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 이번주 (금 기준 월요일)
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30일 fallback
  ]

  for (const since of queries) {
    const { data } = await supabase
      .from('issues')
      .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, updated_at')
      .eq('approval_status', '승인')
      .eq('visibility_status', 'visible')
      .eq('status', '종결')
      .is('merged_into_id', null)
      .gte('updated_at', since)
      .order('heat_index', { ascending: false, nullsFirst: false })
      .limit(5)

    if (!data || data.length === 0) continue

    for (const issue of data as Issue[]) {
      const { data: points } = await supabase
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issue.id)
        .order('occurred_at', { ascending: true })

      if (points && points.length >= 2) {
        return { ...issue, timelinePoints: points as TimelinePoint[] }
      }
    }
  }

  return null
}

function getIssueThumbnail(issue: Issue): string {
  const urls = issue.thumbnail_urls
  if (!urls || urls.length === 0) return ''
  const idx = issue.primary_thumbnail_index ?? 0
  return urls[idx] ?? urls[0] ?? ''
}

// ─── 2. 커버 이미지 (Pexels) ────────────────────────────

async function generateCoverKeywords(issues: Issue[], mode: ContentMode): Promise<string> {
  const topicsList = issues
    .map((i, idx) => `${idx + 1}. "${i.topic ?? i.title}" (${i.category})`)
    .join('\n')

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You are a stock photo search expert. Return ONLY valid JSON, no explanation.' },
      {
        role: 'user',
        content: `Korean news topics (mode: ${mode}):\n${topicsList}\n\nPick the most visually distinctive topic and generate 2-3 English keywords suitable for a Pexels portrait-orientation stock photo search.\nReturn JSON only: {"keywords": "2-3 english words"}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 60,
  })

  try {
    const raw = res.choices[0].message.content ?? '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned).keywords ?? issues[0]?.category ?? 'news'
  } catch {
    return issues[0]?.category ?? 'news'
  }
}

async function fetchPexelsImage(keywords: string): Promise<string | null> {
  if (!PEXELS_API_KEY) {
    console.warn('⚠️  PEXELS_API_KEY 없음 — 다크 커버 사용')
    return null
  }

  try {
    const searchRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=15&orientation=portrait&size=large`,
      { headers: { Authorization: PEXELS_API_KEY } }
    )
    const json = await searchRes.json() as { photos?: Array<{ src: { large2x: string } }> }

    if (!json.photos?.length) {
      console.warn(`⚠️  Pexels 검색 결과 없음 (키워드: ${keywords})`)
      return null
    }

    // 상위 10장 중 랜덤 1장 선택 → 매번 다른 커버
    const pool = json.photos.slice(0, 10)
    const photo = pool[Math.floor(Math.random() * pool.length)]

    // base64 변환 (Playwright 렌더링 안정성)
    const imgRes = await fetch(photo.src.large2x)
    const buffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    console.log(`✅ Pexels 커버 이미지 로드 (키워드: ${keywords})`)
    return `data:image/jpeg;base64,${base64}`
  } catch (err) {
    console.warn('⚠️  Pexels 이미지 오류 — 다크 커버 사용:', (err as Error).message)
    return null
  }
}

// ─── 3. Groq AI 텍스트 생성 헬퍼 ────────────────────────

async function generateBadgeContent(
  issue: Issue,
  context = ''
): Promise<{ desc: string; point_text_01: string; point_text_02: string }> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: '당신은 한국 이슈 카드뉴스 편집자입니다. 반드시 한글(가-힣), 숫자, 영문, 공백, 문장부호만 사용하세요. 한자(발·發·一 등 모든 CJK 문자), 일본어(히라가나·가타카나), 중국어는 단 한 글자도 절대 사용하지 마세요. 위반 시 응답 전체가 거부됩니다. 단어 나열이 아닌 완성된 짧은 문장으로 작성하세요.' },
      {
        role: 'user',
        content: [
          `이슈 제목: "${issue.title}"`,
          `카테고리: ${issue.category} | 화력: ${issue.heat_index ?? 0}점`,
          issue.topic ? `주제: ${issue.topic}` : null,
          issue.topic_description ? `설명: ${issue.topic_description}` : null,
          issue.brief_summary?.bullets?.length
            ? `핵심 내용:\n- ${issue.brief_summary.bullets.join('\n- ')}`
            : null,
          issue.brief_summary?.conclusion
            ? `결론: ${issue.brief_summary.conclusion}`
            : null,
          context || null,
          '',
          '위 정보를 바탕으로 카드뉴스 텍스트를 JSON으로 생성해줘 (한글만, 한자 금지):',
          '{',
          '  "desc": "기승전결 3줄. 1줄=상황 설정, 2줄=반전/전개(그런데·하지만·결국 같은 접속사로 자연스럽게 연결), 3줄=의문형 또는 예고형으로 궁금증 유발. ~~다로 끝나는 줄엔 마침표(.) 필수. 마지막 줄이 의문형이면 물음표(?) 필수. 줄바꿈은 \\\\n 사용 (각 줄 22자 이내)",',
          '  "point_text_01": "이슈 핵심 인물 또는 기관을 나타내는 짧은 구. 앞에 어울리는 이모지 1개 포함 (예: \'🏢 삼성전자 발표\', \'🏐 배구 국가대표\', 이모지 제외 12자 이내)",',
          '  "point_text_02": "이슈의 핵심 상황 또는 쟁점을 나타내는 짧은 구. 앞에 어울리는 이모지 1개 포함 (예: \'🚨 성희롱 의혹 확산\', \'🔍 노동부 조사 착수\', 이모지 제외 12자 이내). point_text_01과 다른 이모지를 사용할 것."',
          '}',
          '',
          '나쁜 예시 (금지): "논란이 일고 있다\\n조사에 착수했다\\n확산되고 있다" — 접속사 없고 마침표·물음표도 없음',
          '좋은 예시: "조용하던 직장에 폭로 한 방.\\n그런데 피해자들이 목소리를 높이기 시작.\\n진실은 과연 드러날까?" — 한 문단처럼 읽히고 물음표로 마무리',
          '',
          'JSON 코드블록 없이 순수 JSON만 출력.',
        ].filter(Boolean).join('\n'),
      },
    ],
    temperature: 0.7,
  })

  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      desc: stripNonKorean(parsed.desc ?? ''),
      point_text_01: stripNonKorean(parsed.point_text_01 ?? ''),
      point_text_02: stripNonKorean(parsed.point_text_02 ?? ''),
    }
  } catch {
    return {
      desc: issue.topic_description?.split('\n').slice(0, 3).join('\n') ?? '내용을 불러오는 중 오류가 발생했습니다.',
      point_text_01: issue.category,
      point_text_02: `화력 ${issue.heat_index ?? 0}점`,
    }
  }
}

// ─── 3. 모드별 슬라이드 생성 ─────────────────────────────

// 월(주말 핫이슈) / 수(이번주 TOP 3): cover + N×badge + follow
async function generateTop3Slides(issues: Issue[], label = '이번주 핫이슈'): Promise<SlideContent[]> {
  const keywords = await generateCoverKeywords(issues, 'weekly-top3')
  const coverBg = await fetchPexelsImage(keywords)

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '오늘의 픽',
      main_title: `${label}\nTOP ${issues.length}`,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: LOGO_BASE64,
    },
  ]

  for (const issue of issues) {
    const content = await generateBadgeContent(issue)
    slides.push({
      type: 'badge',
      sub_title: issue.topic ?? issue.title,
      desc: content.desc,
      point_text_01: content.point_text_01,
      point_text_02: content.point_text_02,
      bg_image_url: getIssueThumbnail(issue),
      logo_image_url: LOGO_BASE64,
    })
  }

  slides.push({ type: 'follow', logo_image_url: LOGO_BASE64 })
  return slides
}

// 화(급상승): cover + badge + body + follow
async function generateSurgingSlides(issue: Issue): Promise<SlideContent[]> {
  const surgePctStr = issue.surgePct != null && issue.surgePct > 0
    ? `${Math.round(issue.surgePct)}%`
    : ''

  const badgeContent = await generateBadgeContent(
    issue,
    `현재 급상승 중인 이슈입니다.${surgePctStr ? ` 1시간 전 대비 화력이 ${surgePctStr} 상승했습니다.` : ''}`
  )

  const bodyRes = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: '당신은 한국 이슈 카드뉴스 편집자입니다. 짧고 명확하게 작성하세요.' },
      {
        role: 'user',
        content: `이슈 제목: "${issue.title}"
카테고리: ${issue.category}
현재 화력: ${issue.heat_index ?? 0}점${surgePctStr ? `, 1시간 전 대비 ${surgePctStr} 급상승` : ''}

이 이슈가 지금 왜 화제인지 배경을 설명해줘.
다음 JSON 형식으로 작성 (한국어):
{
  "sub_title": "왜 지금 화제인가 (20자 이내)",
  "desc": "배경 3줄, 줄바꿈은 \\n 사용 (각 줄 25자 이내)"
}

JSON만 출력, 설명 없이.`,
      },
    ],
    temperature: 0.7,
  })

  let bodyContent: { sub_title: string; desc: string }
  try {
    bodyContent = JSON.parse(bodyRes.choices[0].message.content || '{}')
  } catch {
    bodyContent = { sub_title: '왜 지금 화제인가', desc: '상세 내용을 불러오는 중 오류가 발생했습니다.' }
  }

  const bg = getIssueThumbnail(issue)
  const surgingKeywords = await generateCoverKeywords([issue], 'surging')
  const coverBg = await fetchPexelsImage(surgingKeywords)

  return [
    {
      type: 'cover',
      sub_title: '실시간 급상승',
      main_title: '지금\n화제 중!',
      bg_image_url: coverBg ?? undefined,
      logo_image_url: LOGO_BASE64,
    },
    {
      type: 'badge',
      sub_title: issue.topic ?? issue.title,
      desc: badgeContent.desc,
      point_text_01: issue.category,
      point_text_02: surgePctStr ? `▲ ${surgePctStr}` : `화력 ${issue.heat_index ?? 0}점`,
      bg_image_url: bg,
      logo_image_url: LOGO_BASE64,
    },
    {
      type: 'body',
      sub_title: bodyContent.sub_title,
      desc: bodyContent.desc,
      bg_image_url: bg,
      logo_image_url: LOGO_BASE64,
    },
    { type: 'follow', logo_image_url: LOGO_BASE64 },
  ]
}

// 목(분야별): cover + N×badge + follow
async function generateCategorySlides(issues: Issue[]): Promise<SlideContent[]> {
  const keywords = await generateCoverKeywords(issues, 'by-category')
  const coverBg = await fetchPexelsImage(keywords)

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '카테고리별 정리',
      main_title: '분야별\n핫이슈',
      bg_image_url: coverBg ?? undefined,
      logo_image_url: LOGO_BASE64,
    },
  ]

  for (const issue of issues) {
    const content = await generateBadgeContent(issue, `${issue.category} 분야 최고 화력 이슈입니다.`)
    slides.push({
      type: 'badge',
      sub_title: issue.topic ?? issue.title,
      desc: content.desc,
      point_text_01: issue.category,
      point_text_02: `화력 ${issue.heat_index ?? 0}점`,
      bg_image_url: getIssueThumbnail(issue),
      logo_image_url: LOGO_BASE64,
    })
  }

  slides.push({ type: 'follow', logo_image_url: LOGO_BASE64 })
  return slides
}

// 금(타임라인): cover + N×body + badge(종결) + follow
async function generateTimelineSlides(issue: ClosedIssue): Promise<SlideContent[]> {
  const bg = getIssueThumbnail(issue)
  const timelineKeywords = await generateCoverKeywords([issue], 'timeline')
  const coverBg = await fetchPexelsImage(timelineKeywords)

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '이슈 타임라인',
      main_title: issue.topic ?? issue.title,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: LOGO_BASE64,
    },
  ]

  // 스테이지별 그룹핑 및 정렬
  const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3, '종결': 4 }
  const grouped = new Map<string, TimelinePoint[]>()
  for (const p of issue.timelinePoints) {
    if (!grouped.has(p.stage)) grouped.set(p.stage, [])
    grouped.get(p.stage)!.push(p)
  }
  const stages = Array.from(grouped.keys()).sort(
    (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
  )

  // 마지막 스테이지가 '종결'이면 badge로 처리, 나머지는 body
  const hasClosingStage = stages[stages.length - 1] === '종결'
  const bodyStages = hasClosingStage ? stages.slice(0, -1) : stages
  const closingStage = hasClosingStage ? '종결' : null

  for (const stage of bodyStages) {
    const points = grouped.get(stage)!
    let desc: string

    if (points.length <= 3) {
      desc = points.map(p => p.title).join('\n')
    } else {
      // Groq로 요약
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: '당신은 한국 이슈 카드뉴스 편집자입니다. 짧고 명확하게 작성하세요.' },
          {
            role: 'user',
            content: `이슈: "${issue.title}"
${stage} 단계 사건들:
${points.map(p => p.title).join('\n')}

3줄로 요약해줘. 줄바꿈은 \\n 사용 (각 줄 25자 이내).
JSON: {"desc": "요약"} 만 출력.`,
          },
        ],
        temperature: 0.5,
      })
      try {
        desc = JSON.parse(res.choices[0].message.content || '{}').desc || points.slice(0, 3).map(p => p.title).join('\n')
      } catch {
        desc = points.slice(0, 3).map(p => p.title).join('\n')
      }
    }

    slides.push({
      type: 'body',
      sub_title: stage,
      desc,
      bg_image_url: bg,
      logo_image_url: LOGO_BASE64,
    })
  }

  // 종결 badge 슬라이드
  if (closingStage) {
    const closingPoints = grouped.get(closingStage)!
    const lastOccurred = new Date(closingPoints[closingPoints.length - 1].occurred_at)
    const dateStr = `${lastOccurred.getMonth() + 1}/${lastOccurred.getDate()} 종결`

    slides.push({
      type: 'badge',
      sub_title: '종결',
      desc: closingPoints.slice(0, 3).map(p => p.title).join('\n'),
      point_text_01: dateStr,
      point_text_02: `화력 ${issue.heat_index ?? 0}점`,
      bg_image_url: bg,
      logo_image_url: LOGO_BASE64,
    })
  }

  slides.push({ type: 'follow', logo_image_url: LOGO_BASE64 })
  return slides
}

// ─── 4. HTML → PNG 렌더링 ────────────────────────────────

async function renderSlides(slides: SlideContent[]): Promise<string[]> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const imagePaths: string[] = []

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const templateFile = getTemplateFile(slide.type)
      const template = fs.readFileSync(templateFile, 'utf-8')
      const html = fillTemplate(template, slide)

      const page = await browser.newPage()
      await page.setViewportSize({ width: 1080, height: 1350 })
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 15000 })

      const outputPath = path.join(OUTPUT_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`)
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

function getTemplateFile(type: SlideContent['type']): string {
  const map = {
    cover: 'slide-01-cover.html',
    body: 'slide-02-body.html',
    badge: 'slide-03-badge.html',
    follow: 'slide-04-follow.html',
  }
  return path.join(TEMPLATE_DIR, map[type])
}

function normalizeNewlines(text: string): string {
  return text.replace(/\\n/g, '\n')
}

// CJK 통합 한자·히라가나·가타카나 제거 (한글·영문·숫자·문장부호 유지)
function stripNonKorean(text: string): string {
  return text.replace(/[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/g, '')
}

function fillTemplate(template: string, slide: SlideContent): string {
  return template
    .replace(/\{\{bg_image_url\}\}/g, slide.bg_image_url || '')
    .replace(/\{\{main_title\}\}/g, normalizeNewlines(slide.main_title || ''))
    .replace(/\{\{sub_title\}\}/g, normalizeNewlines(slide.sub_title || ''))
    .replace(/\{\{desc\}\}/g, normalizeNewlines(slide.desc || ''))
    .replace(/\{\{point_text_01\}\}/g, slide.point_text_01 || '')
    .replace(/\{\{point_text_02\}\}/g, slide.point_text_02 || '')
    .replace(/\{\{logo_image_url\}\}/g, slide.logo_image_url || '')
}

// ─── 5. 캡션 생성 ────────────────────────────────────────

// 카테고리 → 해시태그 매핑
const CATEGORY_TAGS: Record<string, string> = {
  '정치': '#정치이슈',
  '경제': '#경제이슈',
  '사회': '#사회이슈',
  '연예': '#연예이슈',
  '스포츠': '#스포츠이슈',
  '기술': '#IT이슈',
}

// 플랫폼별 태그 수: 인스타는 5~8개, 스레드는 2~3개
function buildTags(mode: ContentMode, issues: Issue[], platform: 'instagram' | 'threads'): string {
  const base = ['#왜난리', '#핫이슈']

  const modeTagsMap: Record<ContentMode, string[]> = {
    'weekend-recap': ['#주말이슈', '#주간핫이슈', '#이번주뭐가터졌나'],
    'surging':       ['#급상승이슈', '#실시간이슈', '#지금화제'],
    'weekly-top3':   ['#이번주이슈', '#주간이슈', '#TOP3'],
    'by-category':   ['#분야별이슈', ...issues.map(i => CATEGORY_TAGS[i.category]).filter(Boolean)],
    'timeline':      ['#이슈정리', '#사건타임라인', '#이슈타임라인'],
  }

  const modeTags = modeTagsMap[mode]

  if (platform === 'threads') {
    // 스레드는 태그 최소화 (base 2개 + 모드 1개)
    return [...base, modeTags[0]].join(' ')
  }

  // 인스타는 base + 모드 태그 전체 (중복 제거)
  return Array.from(new Set([...base, ...modeTags])).join(' ')
}

function buildCaption(
  mode: ContentMode,
  issues: Issue[],
  closedIssue: ClosedIssue | null,
  platform: 'instagram' | 'threads' = 'instagram'
): string {
  const url = `whynali.com?utm_source=${platform}&utm_medium=cardnews`
  const tags = buildTags(mode, issues, platform)

  switch (mode) {
    case 'weekend-recap': {
      const lines = issues.map((i, idx) => `${idx + 1}위 "${i.title}"`)
      return ['📸 주말 핫이슈 정리', '', ...lines, '', `전체 타임라인 👉 ${url}`, '', tags].join('\n')
    }
    case 'surging': {
      const issue = issues[0]
      const surge = issue?.surgePct ? ` (▲${Math.round(issue.surgePct)}%)` : ''
      return [
        `📸 지금 가장 빠르게 오르는 이슈${surge}`,
        '',
        `"${issue?.title}"`,
        '',
        `전체 타임라인 👉 ${url}`,
        '',
        tags,
      ].join('\n')
    }
    case 'weekly-top3': {
      const lines = issues.map((i, idx) => `${idx + 1}위 "${i.title}"`)
      return ['📸 이번주 핫이슈 TOP 3', '', ...lines, '', `전체 타임라인 👉 ${url}`, '', tags].join('\n')
    }
    case 'by-category': {
      const lines = issues.map(i => `[${i.category}] "${i.title}"`)
      return ['📸 오늘의 분야별 핫이슈', '', ...lines, '', `전체 타임라인 👉 ${url}`, '', tags].join('\n')
    }
    case 'timeline': {
      return [
        `📸 이슈 타임라인: "${closedIssue?.title}"`,
        '',
        '발단부터 종결까지 한눈에',
        '',
        `전체 타임라인 👉 ${url}`,
        '',
        tags,
      ].join('\n')
    }
  }
}

// ─── 6. Instagram Graph API 업로드 ──────────────────────

async function uploadToInstagram(imagePaths: string[], caption: string): Promise<string> {
  const { urls: imageUrls, fileNames } = await uploadImagesToStorage(imagePaths)

  try {
    const mediaIds: string[] = []
    for (const imageUrl of imageUrls) {
      const res = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: 'true',
          access_token: IG_ACCESS_TOKEN!,
        }),
      })
      const json = (await res.json()) as { id?: string; error?: { message: string; code?: number } }
      if (!json.id) throw new Error(`미디어 컨테이너 생성 실패: ${JSON.stringify(json.error)}`)
      mediaIds.push(json.id)
    }

    // 각 미디어 컨테이너가 FINISHED 상태가 될 때까지 폴링
    for (const mediaId of mediaIds) {
      let attempts = 0
      while (attempts < 15) {
        await new Promise(r => setTimeout(r, 4000))
        const statusRes = await fetch(
          `https://graph.instagram.com/v21.0/${mediaId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
        )
        const statusJson = (await statusRes.json()) as { status_code?: string }
        if (statusJson.status_code === 'FINISHED') break
        if (statusJson.status_code === 'ERROR') throw new Error(`미디어 처리 오류: ${mediaId}`)
        attempts++
      }
      if (attempts >= 15) throw new Error(`미디어 처리 타임아웃: ${mediaId}`)
    }

    const carouselRes = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
      method: 'POST',
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        children: mediaIds.join(','),
        caption,
        access_token: IG_ACCESS_TOKEN!,
      }),
    })
    const carouselJson = (await carouselRes.json()) as { id?: string; error?: { message: string } }
    if (!carouselJson.id) throw new Error(`캐러셀 생성 실패: ${carouselJson.error?.message}`)

    // 캐러셀 컨테이너도 FINISHED 상태가 될 때까지 폴링
    let carouselAttempts = 0
    while (carouselAttempts < 15) {
      await new Promise(r => setTimeout(r, 4000))
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${carouselJson.id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
      )
      const statusJson = (await statusRes.json()) as { status_code?: string }
      if (statusJson.status_code === 'FINISHED') break
      if (statusJson.status_code === 'ERROR') throw new Error(`캐러셀 처리 오류`)
      carouselAttempts++
    }
    if (carouselAttempts >= 15) throw new Error(`캐러셀 처리 타임아웃`)

    const publishRes = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: carouselJson.id,
        access_token: IG_ACCESS_TOKEN!,
      }),
    })
    const publishJson = (await publishRes.json()) as { id?: string; error?: { message: string } }
    if (!publishJson.id) throw new Error(`발행 실패: ${publishJson.error?.message}`)

    return publishJson.id
  } finally {
    await deleteFromStorage(fileNames)
  }
}

async function uploadImagesToStorage(imagePaths: string[]): Promise<{ urls: string[]; fileNames: string[] }> {
  const urls: string[] = []
  const fileNames: string[] = []
  const ts = Date.now()

  for (const imagePath of imagePaths) {
    const fileName = `card-news/${ts}-${path.basename(imagePath)}`
    const fileBuffer = fs.readFileSync(imagePath)

    const { error } = await supabase.storage
      .from('cardnews')
      .upload(fileName, fileBuffer, { contentType: 'image/png', upsert: true })

    if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)

    const { data } = supabase.storage.from('cardnews').getPublicUrl(fileName, {
      transform: { width: 1080, height: 1350, format: 'origin' },
    })
    urls.push(data.publicUrl)
    fileNames.push(fileName)
  }

  return { urls, fileNames }
}

async function deleteFromStorage(fileNames: string[]): Promise<void> {
  const { error } = await supabase.storage.from('cardnews').remove(fileNames)
  if (error) console.warn(`Storage 삭제 실패 (무시):`, error.message)
}

// ─── 7. Threads 업로드 ──────────────────────────────────

async function uploadToThreads(imagePaths: string[], caption: string): Promise<string> {
  console.log('   Threads 업로드 시작...')
  const { urls: imageUrls, fileNames } = await uploadImagesToStorage(imagePaths)

  try {
    const itemIds: string[] = []
    for (const imageUrl of imageUrls) {
      const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, {
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'IMAGE',
          image_url: imageUrl,
          is_carousel_item: 'true',
          access_token: THREADS_ACCESS_TOKEN!,
        }),
      })
      const json = (await res.json()) as { id?: string; error?: { message: string } }
      if (!json.id) throw new Error(`Threads 아이템 컨테이너 생성 실패: ${json.error?.message}`)
      itemIds.push(json.id)
    }

    // 아이템 컨테이너 준비 대기
    console.log('   Threads 아이템 준비 대기 중 (10초)...')
    await new Promise(r => setTimeout(r, 10000))

    const carouselRes = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, {
      method: 'POST',
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        children: itemIds.join(','),
        text: caption,
        access_token: THREADS_ACCESS_TOKEN!,
      }),
    })
    const carouselJson = (await carouselRes.json()) as { id?: string; error?: { message: string } }
    if (!carouselJson.id) throw new Error(`Threads 캐러셀 생성 실패: ${JSON.stringify(carouselJson)}`)

    console.log('   Threads 발행 전 대기 중 (30초)...')
    await new Promise((resolve) => setTimeout(resolve, 30000))

    const publishRes = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: carouselJson.id,
        access_token: THREADS_ACCESS_TOKEN!,
      }),
    })
    const publishJson = (await publishRes.json()) as { id?: string; error?: { message: string } }
    if (!publishJson.id) throw new Error(`Threads 발행 실패: ${publishJson.error?.message}`)

    return publishJson.id
  } finally {
    await deleteFromStorage(fileNames)
  }
}

// ─── 8. X(Twitter) 연계 트윗 ─────────────────────────────
// 무료 플랜 게시 불가 (Basic $100/월 필요) — 참고용으로 보존

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function tweetCardNews(issues: Issue[]): Promise<void> {
  const twitter = new TwitterApi({
    appKey: TWITTER_API_KEY!,
    appSecret: TWITTER_API_SECRET!,
    accessToken: TWITTER_ACCESS_TOKEN!,
    accessSecret: TWITTER_ACCESS_SECRET!,
  })

  const issueLines = issues.map((issue, i) => `${i + 1}위 "${issue.title}"`)
  await twitter.v2.tweet(
    [
      '📸 이번주 핫이슈 카드뉴스 업로드!',
      '',
      ...issueLines,
      '',
      '인스타/스레드 @whynali 에서 확인',
      '전체 타임라인 👉 whynali.com',
      '',
      '#왜난리 #주간이슈 #핫이슈',
    ].join('\n')
  )
}

// ─── 실행 ──────────────────────────────────────────────

run().catch((err) => {
  console.error('❌ 오류:', err.message)
  process.exit(1)
})
