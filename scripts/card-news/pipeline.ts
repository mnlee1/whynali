/**
 * 카드뉴스 자동화 파이프라인
 * 흐름: Supabase 이슈 조회 → Groq AI 텍스트 생성 → HTML 렌더링 → PNG 저장
 *
 * 실행: npx tsx scripts/card-news/pipeline.ts
 * 실제 업로드: npx tsx scripts/card-news/pipeline.ts --publish
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

// Instagram
const IG_USER_ID = process.env.IG_USER_ID
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN

// Threads
const THREADS_USER_ID = process.env.THREADS_USER_ID
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN

// Twitter (X)
const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET

const TEMPLATE_DIR = path.join(__dirname, 'templates')
const OUTPUT_DIR = path.join(__dirname, 'output')
const PUBLISH = process.argv.includes('--publish')

// 로고 Base64 인코딩
const LOGO_PATH = path.join(__dirname, '../../public/whynali-logo.png')
const LOGO_BASE64 = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`

// ─── 타입 ──────────────────────────────────────────────

interface Issue {
  id: string
  title: string
  category: string
  thumbnail_urls?: string[] | null
  primary_thumbnail_index?: number | null
  view_count: number
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

// ─── 메인 ──────────────────────────────────────────────

async function run() {
  console.log('🚀 카드뉴스 파이프라인 시작')

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // 1. 이번 주 TOP 이슈 조회
  const issues = await fetchTopIssues()
  console.log(`✅ 이슈 ${issues.length}개 조회 완료`)

  // 2. AI 텍스트 생성
  const slideContents = await generateSlideContents(issues)
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

  // 4-1. Instagram 업로드
  if (IG_USER_ID && IG_ACCESS_TOKEN) {
    try {
      const caption = buildCaption(issues, 'instagram')
      await uploadToInstagram(imagePaths, caption)
      console.log('✅ Instagram 업로드 완료')
      uploadResults.push('Instagram ✓')
    } catch (err) {
      console.error('❌ Instagram 업로드 실패:', (err as Error).message)
      uploadResults.push('Instagram ✗')
    }
  } else {
    console.warn('⚠️  Instagram: 환경 변수 없음 (IG_USER_ID, IG_ACCESS_TOKEN)')
  }

  // 4-2. Threads 업로드
  if (THREADS_USER_ID && THREADS_ACCESS_TOKEN) {
    try {
      const caption = buildCaption(issues, 'threads')
      await uploadToThreads(imagePaths, caption)
      console.log('✅ Threads 업로드 완료')
      uploadResults.push('Threads ✓')
    } catch (err) {
      console.error('❌ Threads 업로드 실패:', (err as Error).message)
      uploadResults.push('Threads ✗')
    }
  } else {
    console.warn('⚠️  Threads: 환경 변수 없음 (THREADS_USER_ID, THREADS_ACCESS_TOKEN)')
  }

  // 4-3. Twitter(X) 연계 트윗 - 무료 플랜 게시 불가 (Basic $100/월 필요)
  // if (TWITTER_API_KEY && TWITTER_API_SECRET && TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_SECRET) {
  //   try {
  //     await tweetCardNews(issues)
  //     console.log('✅ X(Twitter) 트윗 완료')
  //     uploadResults.push('X(Twitter) ✓')
  //   } catch (err) {
  //     console.error('❌ X(Twitter) 트윗 실패:', (err as Error).message)
  //     uploadResults.push('X(Twitter) ✗')
  //   }
  // }

  console.log('\n📊 업로드 결과:')
  uploadResults.forEach((result) => console.log(`   ${result}`))
  console.log('\n🎉 완료!')
}

// ─── 1. Supabase 이슈 조회 ──────────────────────────────

async function fetchTopIssues(): Promise<Issue[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, view_count')
    .not('status', 'eq', '대기')
    .order('view_count', { ascending: false })
    .limit(3)

  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)
  return data || []
}

function getIssueThumbnail(issue: Issue): string {
  const urls = issue.thumbnail_urls
  if (!urls || urls.length === 0) return ''
  const idx = issue.primary_thumbnail_index ?? 0
  return urls[idx] ?? urls[0] ?? ''
}

// ─── 2. Groq AI 텍스트 생성 ─────────────────────────────

async function generateSlideContents(issues: Issue[]): Promise<SlideContent[]> {
  const groq = new Groq({ apiKey: GROQ_API_KEY })
  const slides: SlideContent[] = []

  // 슬라이드 01: 커버 (전체 요약)
  slides.push({
    type: 'cover',
    main_title: `이번 주\n핫이슈 TOP ${issues.length}`,
    bg_image_url: getIssueThumbnail(issues[0]),
    logo_image_url: LOGO_BASE64,
  })

  // 슬라이드 02~: 이슈별 본문
  for (const issue of issues) {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: '당신은 한국 이슈 카드뉴스 편집자입니다. 짧고 명확하게 작성하세요.',
        },
        {
          role: 'user',
          content: `이슈 제목: "${issue.title}"
카테고리: ${issue.category}
조회수: ${issue.view_count}회

다음 JSON 형식으로 카드뉴스 텍스트를 생성해줘 (한국어):
{
  "sub_title": "이슈 핵심을 한 줄로 (20자 이내)",
  "desc": "3줄 설명, 줄바꿈은 \\n 사용 (각 줄 25자 이내)",
  "point_text_01": "핵심 키워드 1 (12자 이내)",
  "point_text_02": "핵심 키워드 2 (12자 이내)"
}

JSON만 출력, 설명 없이.`,
        },
      ],
      temperature: 0.7,
    })

    let content: { sub_title: string; desc: string; point_text_01: string; point_text_02: string }
    try {
      content = JSON.parse(res.choices[0].message.content || '{}')
    } catch {
      content = {
        sub_title: issue.title.slice(0, 20),
        desc: '내용을 불러오는 중 오류가 발생했습니다.',
        point_text_01: issue.category,
        point_text_02: `조회 ${issue.view_count}회`,
      }
    }

    // 슬라이드 03 타입 (뱃지 포함): 이슈 중 첫 번째에만 적용
    const slideType = issues.indexOf(issue) === 0 ? 'badge' : 'body'

    slides.push({
      type: slideType,
      sub_title: content.sub_title,
      desc: content.desc,
      point_text_01: content.point_text_01,
      point_text_02: content.point_text_02,
      bg_image_url: getIssueThumbnail(issue) || '',
      logo_image_url: LOGO_BASE64,
    })
  }

  // 마지막 슬라이드: 팔로우 카드 (고정 CTA)
  slides.push({
    type: 'follow',
    logo_image_url: LOGO_BASE64,
  })

  return slides
}

// ─── 3. Puppeteer HTML → PNG ─────────────────────────────

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

function fillTemplate(template: string, slide: SlideContent): string {
  return template
    .replace(/\{\{bg_image_url\}\}/g, slide.bg_image_url || '')
    .replace(/\{\{main_title\}\}/g, slide.main_title || '')
    .replace(/\{\{sub_title\}\}/g, slide.sub_title || '')
    .replace(/\{\{desc\}\}/g, slide.desc || '')
    .replace(/\{\{point_text_01\}\}/g, slide.point_text_01 || '')
    .replace(/\{\{point_text_02\}\}/g, slide.point_text_02 || '')
    .replace(/\{\{logo_image_url\}\}/g, slide.logo_image_url || '')
}

// ─── 4. Instagram Graph API 업로드 ──────────────────────

function buildCaption(issues: Issue[], platform: 'instagram' | 'threads' = 'instagram'): string {
    const lines = issues.map((issue, i) => `${i + 1}위 "${issue.title}"`)
    const url = `whynali.com?utm_source=${platform}&utm_medium=cardnews`
    return [
        '📸 이번주 핫이슈 카드뉴스',
        '',
        ...lines,
        '',
        `전체 타임라인 👉 ${url}`,
        '',
        '#왜난리 #주간이슈 #핫이슈',
    ].join('\n')
}

async function uploadToInstagram(imagePaths: string[], caption: string): Promise<void> {
  // Step 1: 각 이미지를 Supabase Storage에 업로드 → public URL 획득
  const imageUrls = await uploadImagesToStorage(imagePaths)

  // Step 2: 이미지별 Instagram 미디어 컨테이너 생성
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

  // Step 3: 캐러셀 컨테이너 생성
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

  // Step 4: 발행
  const publishRes = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: carouselJson.id,
      access_token: IG_ACCESS_TOKEN!,
    }),
  })
  const publishJson = (await publishRes.json()) as { id?: string; error?: { message: string } }
  if (!publishJson.id) throw new Error(`발행 실패: ${publishJson.error?.message}`)
}

async function uploadImagesToStorage(imagePaths: string[]): Promise<string[]> {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY)
  const urls: string[] = []

  for (const imagePath of imagePaths) {
    const fileName = `card-news/${Date.now()}-${path.basename(imagePath)}`
    const fileBuffer = fs.readFileSync(imagePath)

    const { error } = await supabase.storage
      .from('public')
      .upload(fileName, fileBuffer, { contentType: 'image/png', upsert: true })

    if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)

    const { data } = supabase.storage.from('public').getPublicUrl(fileName, {
      transform: { width: 1080, height: 1350, format: 'origin' }
    })
    urls.push(data.publicUrl)
  }

  return urls
}

// ─── 5. Threads 업로드 ──────────────────────────────────

async function uploadToThreads(imagePaths: string[], caption: string): Promise<void> {
  console.log('   Threads 업로드 시작...')
  
  // Step 1: 이미지를 Supabase Storage에 업로드 → public URL 획득
  const imageUrls = await uploadImagesToStorage(imagePaths)

  // Step 2: 이미지별 Threads 미디어 컨테이너 생성
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

  // Step 3: 캐러셀 컨테이너 생성
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

  // Step 4: 최소 30초 대기 후 발행
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
}

// ─── 6. X(Twitter) 연계 트윗 ─────────────────────────────

async function tweetCardNews(issues: Issue[]): Promise<void> {
  const twitter = new TwitterApi({
    appKey: TWITTER_API_KEY!,
    appSecret: TWITTER_API_SECRET!,
    accessToken: TWITTER_ACCESS_TOKEN!,
    accessSecret: TWITTER_ACCESS_SECRET!,
  })

  const issueLines = issues.map((issue, i) => `${i + 1}위 "${issue.title}"`)
  
  const tweet = [
    '📸 이번주 핫이슈 카드뉴스 업로드!',
    '',
    ...issueLines,
    '',
    '인스타/스레드 @whynali 에서 확인',
    '전체 타임라인 👉 whynali.com',
    '',
    '#왜난리 #주간이슈 #핫이슈',
  ].join('\n')

  await twitter.v2.tweet(tweet)
}

// ─── 실행 ──────────────────────────────────────────────

run().catch((err) => {
  console.error('❌ 오류:', err.message)
  process.exit(1)
})
