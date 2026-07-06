/**
 * lib/card-news/core.ts
 *
 * 카드뉴스 공통 로직 — pipeline.ts와 Next.js API 양쪽에서 import
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'

// ─── 클라이언트 ─────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getGroq() {
  const keys = (process.env.GROQ_API_KEY ?? '').split(',').map(k => k.trim()).filter(Boolean)
  if (keys.length === 0) throw new Error('GROQ_API_KEY 없음')
  const apiKey = keys[Math.floor(Math.random() * keys.length)]
  return new Groq({ apiKey })
}

// 429 발생 시 순서대로 폴백 (각 모델 TPD 한도 200K 독립)
const GROQ_MODEL_CHAIN = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
]

async function groqCreate(
  client: Groq,
  params: Parameters<Groq['chat']['completions']['create']>[0],
) {
  const p = { ...params, stream: false as const }
  const startIndex = GROQ_MODEL_CHAIN.indexOf(p.model as string)
  const candidates = startIndex >= 0
    ? GROQ_MODEL_CHAIN.slice(startIndex)
    : [p.model as string, ...GROQ_MODEL_CHAIN.slice(1)]

  let lastError: any
  for (const model of candidates) {
    try {
      return await client.chat.completions.create({ ...p, model })
    } catch (error: any) {
      if (error.status !== 429) throw error
      lastError = error
      console.warn(`[card-news] ${model} 429 → 다음 모델로 폴백`)
    }
  }
  throw lastError
}

// ─── 타입 ───────────────────────────────────────────────

export type ContentMode =
  | 'weekend-recap'
  | 'surging'
  | 'weekly-top3'
  | 'by-category'
  | 'timeline'
  | 'qa'
  | 'debate'
  | 'by-numbers'

export const SINGLE_ISSUE_MODES: ContentMode[] = ['surging', 'timeline', 'qa', 'debate', 'by-numbers']

export interface Issue {
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
  created_at?: string | null
}

export interface TimelinePoint {
  stage: string
  title: string
  occurred_at: string
}

export interface ClosedIssue extends Issue {
  timelinePoints: TimelinePoint[]
}

export interface SlideContent {
  type: 'cover' | 'body' | 'badge' | 'follow' | 'numbers'
  main_title?: string
  sub_title?: string
  desc?: string
  point_text_01?: string
  point_text_02?: string
  bg_image_url?: string
  logo_image_url?: string
}

// ─── 상수 ───────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  '정치': '🏛️',
  '경제': '💰',
  '사회': '🚨',
  '연예': '🎭',
  '스포츠': '⚽',
  '기술': '💻',
}

export const catEmoji = (category: string) =>
  `${CATEGORY_EMOJI[category] ?? '📌'} ${category}`

const SYSTEM_BASE = `CRITICAL: Write ALL text exclusively in Korean (Hangul). Zero CJK/Chinese/Japanese characters allowed. Numbers and punctuation are fine.

당신은 한국 인스타그램·스레드용 SNS 카드뉴스 편집자입니다.

[필수 규칙 — 위반 시 응답 전체 거부]
1. 한글(가-힣)·숫자·영문 약어(BTS, DNA 등 대문자 약어)·공백·문장부호(. ? ! , · … -)만 허용. 독일어·프랑스어·스페인어 등 다른 외국어 단어 절대 금지. 외래어·외국어는 반드시 한글 발음으로 표기. 한자(發·中·美·等·間 등 CJK 문자)·일본어(히라가나·가타카나)·중국어 1자도 절대 금지.
2. AI 문체 금지: "~하고 있습니다" "~한 것으로 알려졌습니다" "~됩니다" "~입니다" "~합니다" "~있습니다" 사용 금지.
3. 구어체 사용: 반드시 "~야" "~이래" "~거야" "~했대" "~대" "~인 거야" "~했어" "~됐어" 같은 서술어로 문장을 완결할 것.
   신문 헤드라인 스타일(명사 나열 + 마침표) 절대 금지.
   ❌ "마이크론 실적 또 역대급." (서술어 없는 명사 나열)
   ❌ "AI 수요가 실적 주도." (서술어 없음)
   ❌ "메모리 반도체 수요가 급증." (서술어 없음)
   ✅ "마이크론 실적이 또 역대급을 찍었대." (서술어로 완결)
   ✅ "AI 수요가 실적을 끌어올린 거야." (서술어로 완결)
   ✅ "메모리 반도체 수요가 폭발적으로 늘었어." (서술어로 완결)
4. 각 줄은 구체적으로: 인물명·기관명·수치·사건명을 직접 언급. 추상적 서술("논란이 일고 있다", "화제가 됐다") 금지.
5. 줄 사이는 자연스럽게 이어질 것. 이유·배경·심화·반전 중 맥락에 맞는 흐름 선택. 억지 반전을 위해 다른 소재로 점프 금지.
6. 전문 용어·기술 약어 금지: 일반인이 모르는 약어·전문어는 반드시 쉬운 표현으로 풀어 쓸 것.
   ❌ HBM → ✅ AI용 고성능 메모리
   ❌ PCE → ✅ 물가 지수
   ❌ ETF → ✅ 지수 투자 상품
   ❌ 가이던스 → ✅ 다음 분기 전망
   ❌ 어닝서프라이즈 → ✅ 예상을 뛰어넘은 실적
   ❌ 밸류에이션 → ✅ 주가 수준
   ❌ PBR → ✅ 주가순자산비율
   ❌ 컨센서스 → ✅ 시장 예상치
   단, BTS·AI·DNA·IT처럼 일반인도 이미 아는 약어는 허용.
7. 어미 통일: 같은 desc/answer/points 블록 안에서는 종결 스타일을 하나로 통일할 것 — "~야"·"~거야"·"~했어"·"~됐어" 계열 또는 "~이래"·"~했대"·"~대"·"~거래" 계열 중 하나만 골라 끝까지 유지. 규칙 3의 서술어 목록은 "그중 아무거나 섞어써도 된다"는 뜻이 아니라 "이 중 하나의 계열을 고르라"는 뜻.
   ❌ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었대." (했어→했대 혼용, 절대 금지)
   ✅ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었어." (한 계열로 통일)
8. 주어 반복 금지: 한 블록 안에서 주체 명사(인물명·기업명)는 첫 줄에서 한 번만 명시하고, 이어지는 줄에서는 주어를 생략할 것(한국어는 주어 생략이 자연스러움). 매 줄 같은 명사를 반복하면 기계적으로 들려서 금지.
   ❌ "마이크론 실적이 좋았어.\\n마이크론은 AI 수요 덕분이래." (주어 반복, 절대 금지)
   ✅ "마이크론 실적이 좋았어.\\nAI 수요 덕분이래." (둘째 줄 주어 생략)`

const SEVEN_DAYS_AGO = () =>
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

const THREE_DAYS_AGO = () =>
  new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

// ─── 헬퍼 ───────────────────────────────────────────────

export function normalizeNewlines(text: string): string {
  // 리터럴 \n (백슬래시+n) → 실제 newline. JSON.parse 후 이미 실제 newline이면 그대로 통과.
  return text.replace(/\\n/g, '\n')
}

// AI가 줄바꿈 없이 한 줄로 출력했을 때 문장 단위로 강제 분리 (마침표·물음표·느낌표 뒤 공백)
export function enforceLineBreaks(text: string, maxLines = 3): string {
  if (text.includes('\n')) return text  // 이미 줄바꿈 있으면 그대로
  const sentences = text.split(/(?<=[.?!。])\s+/)
  return sentences.slice(0, maxLines).join('\n')
}

// 각 줄이 maxLen자를 초과하면 마지막 공백 기준 절단, 공백 없으면 hard-cut
function truncateDescLine(line: string, maxLen = 30): string {
  if (line.length <= maxLen) return line
  const spaceIdx = line.lastIndexOf(' ', maxLen)
  if (spaceIdx > maxLen / 2) return line.slice(0, spaceIdx)
  return line.slice(0, maxLen)
}

// desc 전체 포맷 정규화: 줄별 절단 + 최대 3줄
function formatDesc(text: string): string {
  return text
    .split('\n')
    .map(l => truncateDescLine(l.trim()))
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
}

// 잘못된 기업명 표기 교정 + 붙여쓴 기업명 사이에 가운뎃점(·) 자동 삽입
const COMPANY_BOUNDARIES: [RegExp, string][] = [
  // 줄임말·축약 교정 (먼저 처리)
  [/삼성SK하이닉스/g, '삼성전자·SK하이닉스'],
  [/삼성·SK하이닉스/g, '삼성전자·SK하이닉스'],
  [/삼성SK\b/g, '삼성전자·SK하이닉스'],
  [/현대차·기아/g, '현대자동차·기아'],
  [/현대차기아/g, '현대자동차·기아'],
  // 붙여쓴 정식 명칭 사이 가운뎃점 삽입
  [/(삼성전자)(SK하이닉스)/g, '$1·$2'],
  [/(SK하이닉스)(삼성전자)/g, '$1·$2'],
  [/(삼성전자)(LG전자)/g, '$1·$2'],
  [/(LG전자)(삼성전자)/g, '$1·$2'],
  [/(현대자동차)(기아)/g, '$1·$2'],
  [/(기아)(현대자동차)/g, '$1·$2'],
  [/(카카오)(네이버)/g, '$1·$2'],
  [/(네이버)(카카오)/g, '$1·$2'],
]
function fixMiddleDot(text: string): string {
  let result = text
  for (const [pattern, replacement] of COMPANY_BOUNDARIES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// 커버 타이틀을 단어 경계 기준 중간에서 자동 분리 (10자 이하면 그대로)
function breakCoverTitle(title: string): string {
  if (title.length <= 10) return title
  const words = title.split(' ')
  if (words.length < 2) return title
  let best = 1, bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (diff < bestDiff) { bestDiff = diff; best = i }
  }
  return words.slice(0, best).join(' ') + '\n' + words.slice(best).join(' ')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function stripNonKorean(text: string): string {
  // 1단계: CJK·일본어 계열 제거
  const step1 = text.replace(/[　-〿぀-ヿ㄀-ㄯ一-鿿豈-﫿＀-￯]/g, '')
  // 2단계: 라틴 확장 문자 제거 (â, ê, ô, ñ 등)
  const step2 = step1.replace(/[-ɏ]/g, '')
  // 3단계: 4자 이상 소문자 연속 ASCII 제거 (독일어·프랑스어 등 외래어 차단, BTS·DNA 같은 대문자 약어는 유지)
  return step2.replace(/[a-z]{4,}/g, '').trim()
}
// AI가 한자/일본어로 생성해 stripNonKorean 후 텍스트가 너무 짧으면 폴백
function safeStrip(text: string, fallback: string, minLen = 5): string {
  const stripped = fixMiddleDot(stripNonKorean(text).trim())
  return stripped.length >= minLen ? stripped : fallback
}

// AI가 잘못 축약한 비표준 한국어 서술어 교정
function fixKoreanContractions(text: string): string {
  return text
    .replace(/올랄([가-힣])/g, '올라갈$1')    // 올랄까 → 올라갈까
    .replace(/늘랄([가-힣])/g, '늘어날$1')    // 늘랄까 → 늘어날까
    .replace(/줄랄([가-힣])/g, '줄어들$1')    // 줄랄까 → 줄어들까
    .replace(/커질랄([가-힣])/g, '커질$1')    // 커질랄까 → 커질까
    .replace(/갈랄([가-힣])/g, '갈$1')        // 갈랄까 → 갈까
    .replace(/될랄([가-힣])/g, '될$1')        // 될랄까 → 될까
}

export function getIssueThumbnail(issue: Issue): string {
  const urls = issue.thumbnail_urls
  if (!urls || urls.length === 0) return ''
  const idx = issue.primary_thumbnail_index ?? 0
  return urls[idx] ?? urls[0] ?? ''
}

// ─── 템플릿 ─────────────────────────────────────────────

const TEMPLATE_DIR = path.join(process.cwd(), 'scripts/card-news/templates')

export function getTemplateHtml(type: SlideContent['type']): string {
  const fileMap = {
    cover: 'slide-01-cover.html',
    body: 'slide-02-body.html',
    badge: 'slide-03-badge.html',
    follow: 'slide-04-follow.html',
    numbers: 'slide-05-numbers.html',
  }
  return fs.readFileSync(path.join(TEMPLATE_DIR, fileMap[type]), 'utf-8')
}

export function fillTemplate(template: string, slide: SlideContent): string {
  return template
    .replace(/\{\{bg_image_url\}\}/g, slide.bg_image_url || '')
    .replace(/\{\{main_title\}\}/g, escapeHtml(normalizeNewlines(slide.main_title || '')))
    .replace(/\{\{sub_title\}\}/g, escapeHtml(normalizeNewlines(breakCoverTitle(slide.sub_title || ''))))
    .replace(/\{\{desc\}\}/g, escapeHtml(formatDesc(enforceLineBreaks(normalizeNewlines(slide.desc || '')))))
    .replace(/\{\{point_text_01\}\}/g, escapeHtml(slide.point_text_01 || ''))
    .replace(/\{\{point_text_02\}\}/g, escapeHtml(slide.point_text_02 || ''))
    .replace(/\{\{logo_image_url\}\}/g, slide.logo_image_url || '')
}

export function slidesToHtmlArray(
  slides: SlideContent[],
  followSlideBase64?: string,
): string[] {
  return slides.map(slide => {
    if (slide.type === 'follow' && followSlideBase64) {
      return `<img src="${followSlideBase64}" style="width:1080px;height:1350px;">`
    }
    const template = getTemplateHtml(slide.type)
    return fillTemplate(template, slide)
  })
}

// ─── 로고 ────────────────────────────────────────────────

export function getLogoBase64(): string {
  const logoPath = path.join(process.cwd(), 'public/whynali-logo.png')
  return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
}

// ─── Supabase 데이터 조회 ────────────────────────────────

export async function fetchRecentlyUsedIssueIds(days = 7): Promise<Set<string>> {
  const supabase = getSupabase()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('card_news_logs')
    .select('issues')
    .gte('created_at', since)
  if (!data || data.length === 0) return new Set()
  const ids = data.flatMap(log =>
    (log.issues as Array<{ id: string }> | null)?.map(i => i.id) ?? []
  )
  return new Set(ids)
}

export async function fetchTopIssues(excludeIds: Set<string> = new Set()): Promise<Issue[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .gte('updated_at', SEVEN_DAYS_AGO())
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(20)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)
  return ((data || []) as Issue[]).filter(i => !excludeIds.has(i.id)).slice(0, 3)
}

export async function fetchWeekendTopIssues(excludeIds: Set<string> = new Set()): Promise<Issue[]> {
  const supabase = getSupabase()
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .gte('updated_at', since)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(20)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)

  const result = ((data || []) as Issue[]).filter(i => !excludeIds.has(i.id)).slice(0, 3)
  if (result.length >= 3) return result

  const fallback = await fetchTopIssues(excludeIds)
  const existing = new Set(result.map(i => i.id))
  return [...result, ...fallback.filter(i => !existing.has(i.id))].slice(0, 3)
}

export async function fetchSurgingIssue(excludeIds: Set<string> = new Set()): Promise<Issue | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, heat_index_1h_ago, topic, topic_description, created_at')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .gte('created_at', THREE_DAYS_AGO())
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)

  // 3일 이내 생성 이슈 중 화력 1위 선택 (DB에서 heat_index DESC로 정렬됨)
  const candidates = ((data || []) as Issue[]).filter(i => !excludeIds.has(i.id))
  if (candidates.length === 0) return null

  const top = candidates[0]
  const surgePct = top.heat_index_1h_ago && top.heat_index_1h_ago > 0
    ? ((top.heat_index ?? 0) - top.heat_index_1h_ago) / top.heat_index_1h_ago * 100
    : 0
  return { ...top, surgePct: Math.max(surgePct, 0) }
}

const CARD_NEWS_CATEGORIES = ['정치', '경제', '사회', '연예'] as const

export async function fetchCategoryTopIssues(excludeIds: Set<string> = new Set()): Promise<Issue[]> {
  const supabase = getSupabase()
  const results: Issue[] = []
  for (const cat of CARD_NEWS_CATEGORIES) {
    const { data } = await supabase
      .from('issues')
      .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description')
      .eq('approval_status', '승인')
      .eq('visibility_status', 'visible')
      .neq('status', '종결')
      .is('merged_into_id', null)
      .gte('updated_at', SEVEN_DAYS_AGO())
      .eq('category', cat)
      .order('heat_index', { ascending: false, nullsFirst: false })
      .limit(10)
    if (data && data.length > 0) {
      const pick = (data as Issue[]).find(i => !excludeIds.has(i.id))
      if (pick) results.push(pick)
    }
  }
  return results
}

export async function fetchClosedIssueTimeline(excludeIds: Set<string> = new Set()): Promise<ClosedIssue | null> {
  const supabase = getSupabase()
  const queries = [
    new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  ]

  // 1차: 진행중 이슈 중 3단계 이상 전개된 것 우선
  for (const since of queries) {
    const { data } = await supabase
      .from('issues')
      .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, updated_at')
      .eq('approval_status', '승인')
      .eq('visibility_status', 'visible')
      .eq('status', '진행중')
      .is('merged_into_id', null)
      .gte('updated_at', since)
      .order('heat_index', { ascending: false, nullsFirst: false })
      .limit(20)

    if (!data || data.length === 0) continue

    for (const issue of (data as Issue[]).filter(i => !excludeIds.has(i.id))) {
      const { data: points } = await supabase
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issue.id)
        .order('occurred_at', { ascending: true })

      if (points && new Set(points.map(p => p.stage)).size >= 3) {
        return { ...issue, timelinePoints: points as TimelinePoint[] }
      }
    }
  }

  // 2차 폴백: 최근 종결 이슈
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
      .limit(10)

    if (!data || data.length === 0) continue

    for (const issue of (data as Issue[]).filter(i => !excludeIds.has(i.id))) {
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

export async function fetchIssueById(id: string): Promise<Issue | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, heat_index_1h_ago, topic, topic_description')
    .eq('id', id)
    .single()
  return (data as Issue | null)
}

export async function fetchIssueWithTimeline(id: string): Promise<ClosedIssue | null> {
  const issue = await fetchIssueById(id)
  if (!issue) return null
  const supabase = getSupabase()
  const { data: points } = await supabase
    .from('timeline_points')
    .select('stage, title, occurred_at')
    .eq('issue_id', id)
    .order('occurred_at', { ascending: true })
  return { ...issue, timelinePoints: (points as TimelinePoint[]) ?? [] }
}

// 이슈 검색 (관리자 UI용)
export async function searchIssues(query: string, limit = 10): Promise<Issue[]> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('issues')
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, topic, topic_description')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .is('merged_into_id', null)
    .ilike('title', `%${query}%`)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(limit)
  return (data as Issue[]) ?? []
}

// ─── 카드뉴스 draft (관리자 텍스트 수정본) ─────────────────

// 관리자가 미리보기에서 수정한 slides를 저장하고 draft id 반환
export async function saveCardNewsDraft(
  issueId: string,
  mode: ContentMode,
  slides: SlideContent[],
  createdBy: string | null,
): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('card_news_drafts')
    .insert({ issue_id: issueId, mode, slides, created_by: createdBy })
    .select('id')
    .single()
  if (error) throw new Error(`draft 저장 실패: ${error.message}`)
  return data.id as string
}

// draft id로 저장된 slides 조회 (pipeline.ts에서 AI 재생성 대신 사용)
export async function fetchCardNewsDraft(draftId: string): Promise<SlideContent[] | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('card_news_drafts')
    .select('slides')
    .eq('id', draftId)
    .single()
  return (data?.slides as SlideContent[] | undefined) ?? null
}

// pipeline.ts가 draft를 소비한 시각 기록 (감사 추적용)
export async function markCardNewsDraftUsed(draftId: string): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('card_news_drafts')
    .update({ used_at: new Date().toISOString() })
    .eq('id', draftId)
}

// ─── Groq AI 헬퍼 ────────────────────────────────────────

export async function fetchNewsHeadlines(issueId: string, limit = 5): Promise<string[]> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('news_data')
    .select('title, source')
    .eq('issue_id', issueId)
    .not('title', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit)
  if (!data || data.length === 0) return []
  return data.map(n => `- ${n.title}${n.source ? ` (${n.source})` : ''}`)
}

// 이슈에 저장된 모든 컨텍스트를 하나의 문자열로 조합
// topic_description + 뉴스 헤드라인(최대 10건) + 타임라인 포인트
// 이슈 제목/주제에서 핵심 키워드 추출 (2자 이상, 중복 제거)
function extractKeywords(issue: Issue): string[] {
  const src = `${issue.title} ${issue.topic ?? ''}`
  const all = src.match(/[가-힣]{2,}/g) ?? []
  return [...new Set(all)]
}

// 헤드라인에서 키워드가 몇 개 매칭되는지 카운트
function keywordMatchCount(text: string, keywords: string[]): number {
  return keywords.filter(kw => text.includes(kw)).length
}

// 관련 텍스트로 인정하는 최소 매칭 수 (키워드 2개 이상이면 2개 일치 요구, 그 미만이면 1개로 충분)
function minMatchRequired(keywords: string[]): number {
  return keywords.length >= 2 ? 2 : 1
}

export async function buildIssueContext(issue: Issue): Promise<string> {
  const supabase = getSupabase()

  const [headlines, timelineResult] = await Promise.all([
    fetchNewsHeadlines(issue.id, 15),  // 더 많이 가져와서 필터 후 적절량 확보
    supabase
      .from('timeline_points')
      .select('stage, title')
      .eq('issue_id', issue.id)
      .order('occurred_at', { ascending: true }),
  ])

  // 키워드 2개 이상 매칭된 헤드라인만 채택, 매칭 수 높은 순 정렬
  const keywords = extractKeywords(issue)
  const minMatch = minMatchRequired(keywords)
  const filteredHeadlines = headlines
    .map(h => ({ h, count: keywordMatchCount(h, keywords) }))
    .filter(x => x.count >= minMatch)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(x => x.h)

  const parts: string[] = []

  if (issue.topic_description?.trim()) {
    parts.push(`[이슈 설명]\n${issue.topic_description.trim()}`)
  }

  if (filteredHeadlines.length > 0) {
    parts.push(`[관련 뉴스 ${filteredHeadlines.length}건 — 최신순]\n${filteredHeadlines.join('\n')}`)
  }

  const allTimelinePoints = (timelineResult.data ?? []) as { stage: string; title: string }[]
  // 이슈 키워드 2개 이상 포함된 타임라인 포인트만 사용
  const timelinePoints = allTimelinePoints.filter(
    p => keywordMatchCount(p.title, keywords) >= minMatch
  )
  if (timelinePoints.length > 0) {
    const byStage = timelinePoints.reduce<Record<string, string[]>>((acc, p) => {
      if (!acc[p.stage]) acc[p.stage] = []
      acc[p.stage].push(stripNonKorean(p.title))
      return acc
    }, {})
    const timelineStr = Object.entries(byStage)
      .map(([stage, titles]) => `[${stage}]\n${titles.join('\n')}`)
      .join('\n')
    parts.push(`[타임라인]\n${timelineStr}`)
  }

  return parts.join('\n\n')
}

function getEnglishKeywordFallback(issue: Issue): string {
  const text = `${issue.title ?? ''} ${issue.topic ?? ''}`.toLowerCase()
  const cat = issue.category ?? ''

  if (cat === '스포츠') {
    if (/축구|월드컵|soccer|football/.test(text)) return 'soccer football stadium'
    if (/야구|baseball/.test(text))               return 'baseball player pitch'
    if (/농구|basketball/.test(text))             return 'basketball court player'
    if (/배구|volleyball/.test(text))             return 'volleyball player court'
    if (/테니스|tennis/.test(text))               return 'tennis player court'
    if (/골프|golf/.test(text))                   return 'golf course player'
    if (/수영|swimming/.test(text))               return 'swimming pool athlete'
    if (/육상|마라톤|marathon|track/.test(text))  return 'track athletics runner'
    if (/복싱|권투|boxing/.test(text))            return 'boxing ring fighter'
    return 'sports athlete stadium'
  }
  if (cat === '연예') {
    if (/아이돌|콘서트|concert/.test(text))       return 'concert stage lights'
    if (/드라마|영화|film|actor/.test(text))       return 'film set actor scene'
    return 'entertainment stage spotlight'
  }
  if (cat === '정치') return 'parliament podium politician'
  if (cat === '경제') {
    if (/주식|증시|stock|finance/.test(text))     return 'stock market finance chart'
    return 'business office meeting'
  }
  if (cat === '사회') {
    if (/재판|법원|판결|trial|court/.test(text))  return 'courtroom judge gavel'
    if (/시위|집회|protest/.test(text))           return 'protest crowd street'
    return 'city street crowd'
  }
  if (cat === '기술') return 'technology circuit innovation'
  if (cat === '세계') return 'world map international'
  if (cat === '커뮤니티') return 'community gathering people'
  return 'news current events'
}

export async function generateCoverKeywords(issues: Issue[], mode: ContentMode): Promise<string> {
  const groq = getGroq()
  const topicsList = issues
    .map((i, idx) => {
      const topic = i.topic ?? i.title
      return `${idx + 1}. title="${i.title}" topic="${topic}" category=${i.category}`
    })
    .join('\n')

  const modeHint: Partial<Record<ContentMode, string>> = {
    'surging':    'breaking news urgency momentum',
    'by-numbers': 'data statistics numbers facts',
    'timeline':   'story sequence time progression',
    'qa':         'question answer explanation',
    'debate':     'conflict two sides argument',
  }
  const hint = modeHint[mode] ?? 'current events'

  const res = await groqCreate(groq,{
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are a Pexels stock photo search expert. Return ONLY valid JSON, no explanation.' },
      {
        role: 'user',
        content: `/nothink
Korean news topic(s):
${topicsList}
Mode mood: ${hint}

Generate 2-3 SPECIFIC English keywords for a Pexels portrait-orientation stock photo.

RULES — follow exactly:
1. Match the EXACT subject from the title/topic. If it mentions soccer/football → use "soccer". If basketball → "basketball". Never substitute another sport.
2. Keywords must be visually concrete and searchable on Pexels.
3. NEVER use: "korea", "korean", "news", "event", "story", "people", "issue"

Category keyword guides (pick the most specific match):
- 스포츠 soccer/football: "soccer player stadium"
- 스포츠 baseball: "baseball player pitch"
- 스포츠 basketball: "basketball court player"
- 스포츠 other: use the specific sport name
- 연예 idol/concert: "concert stage lights"
- 연예 actor/drama: "film set actor scene"
- 정치: "parliament podium politician"
- 경제 stock/finance: "stock market finance"
- 경제 corporate: "business office meeting"
- 사회 crime/trial: "courtroom judge gavel"
- 사회 protest: "protest crowd street"
- 기술: "technology circuit innovation"

Examples:
✅ "soccer football stadium" for 월드컵 경기
✅ "courtroom judge gavel" for 재판 이슈
✅ "concert stage lights" for 아이돌 콘서트
❌ "tennis court sport" for a soccer topic (WRONG sport — never substitute)
❌ "sport athlete game" (too generic)

Return JSON only: {"keywords": "2-3 specific english words"}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })

  try {
    const raw = res.choices[0].message.content ?? '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const keywords: string = JSON.parse(cleaned).keywords ?? ''
    if (!keywords || /[가-힣]/.test(keywords) || keywords.trim().split(/\s+/).length < 2) {
      return getEnglishKeywordFallback(issues[0])
    }
    return keywords
  } catch {
    return getEnglishKeywordFallback(issues[0])
  }
}

export async function generateStageKeywords(issue: Issue, stage: string, points: TimelinePoint[]): Promise<string> {
  const groq = getGroq()
  const pointTitles = points.slice(0, 3).map(p => p.title).join(', ')
  const res = await groqCreate(groq,{
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are a Pexels stock photo search expert. Return ONLY valid JSON.' },
      {
        role: 'user',
        content: `/nothink
Issue: "${issue.title}" (category: ${issue.category}) — stage: ${stage}
Key events: ${pointTitles}

Generate 2-3 SPECIFIC English keywords for a Pexels portrait photo that visually matches this stage's subject and mood.
- Match the exact activity/subject (soccer → "soccer", trial → "courtroom", protest → "crowd protest")
- NEVER substitute a different activity (no "tennis" for soccer, no generic "sport")
- NEVER use: "korea", "korean", "news", "people"

Return JSON only: {"keywords": "2-3 specific english words"}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })
  try {
    const raw = res.choices[0].message.content ?? '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const keywords: string = JSON.parse(cleaned).keywords ?? ''
    if (!keywords || /[가-힣]/.test(keywords) || keywords.trim().split(/\s+/).length < 2) {
      return getEnglishKeywordFallback(issue)
    }
    return keywords
  } catch {
    return getEnglishKeywordFallback(issue)
  }
}

export async function fetchPexelsImage(keywords: string): Promise<string | null> {
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY
  if (!PEXELS_API_KEY) return null

  try {
    const searchRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=15&orientation=portrait&size=large`,
      { headers: { Authorization: PEXELS_API_KEY } }
    )
    const json = await searchRes.json() as { photos?: Array<{ src: { large2x: string } }> }
    if (!json.photos?.length) return null

    const pool = json.photos.slice(0, 10)
    const photo = pool[Math.floor(Math.random() * pool.length)]

    const imgRes = await fetch(photo.src.large2x)
    const buffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:image/jpeg;base64,${base64}`
  } catch {
    return null
  }
}

export async function generateBadgeContent(
  issue: Issue,
  context = ''
): Promise<{ desc: string; point_text_01: string; point_text_02: string }> {
  const groq = getGroq()
  const issueContext = await buildIssueContext(issue)

  const res = await groqCreate(groq,{
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_BASE },
      {
        role: 'user',
        content: [
          `이슈 제목: "${issue.title}"`,
          `카테고리: ${issue.category}`,
          issue.topic ? `주제: ${issue.topic}` : null,
          issueContext || null,
          context || null,
          '',
          '위 정보를 바탕으로 SNS 카드뉴스 텍스트를 JSON으로 생성해줘.',
          '',
          '[desc — 3문장이 하나의 소재에 집중된 하나의 이야기]',
          'desc_1·desc_2·desc_3는 하나의 주체(인물/기업/사건)에 집중. desc_1에서 정한 주체가 desc_2·desc_3에서도 유지되어야 함.',
          '  ❌ "코스피 9000선 안착했어.\\n마이크론 실적 발표로 관심 쏠려.\\n1만원 고지 넘을까?" → 줄마다 주체가 달라짐. 절대 금지.',
          '  ✅ "마이크론 3분기 매출이 예상을 크게 넘었어.\\nAI 수요가 HBM 판매를 끌어올렸어.\\n이번이 진짜 반등 신호일까?" → 마이크론에 집중',
          '어미 통일: 세 줄의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 줄마다 다른 스타일 섞으면 절대 금지.',
          '  ❌ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었대." → "~했어"와 "~했대" 혼용. 절대 금지.',
          '  ✅ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었어." → 동일 스타일 유지',
          '주어 반복 금지: 주체 명사(인물명·기업명)는 desc_1에서만 명시. desc_2·desc_3에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.',
          '  ❌ "마이크론 실적이 좋았어.\\n마이크론은 AI 수요 덕분이래." → "마이크론" 반복. 절대 금지.',
          '  ✅ "마이크론 실적이 좋았어.\\nAI 수요 덕분이래." → 주어 생략',
          'desc_1: 이슈의 핵심 사실을 짧고 구체적으로. 이슈 제목의 핵심 주체를 직접 언급. 마침표(.)로 끝낼 것.',
          '  ✅ "마이크론 3분기 매출이 예상을 크게 넘었어."',
          '  ✅ "BTS 슈가가 활동 복귀를 알렸어."',
          '  ❌ "숫자 뒤에 숨겨진 게 있어." (이슈 내용 없는 추상 문장 금지)',
          '  ❌ desc_1은 반드시 마침표(.)로 끝낼 것. 물음표(?) 금지.',
          'desc_2: desc_1의 주체에 대한 이유·배경·심화·반전. 새 주체 등장 금지. 마침표(.)로 끝낼 것.',
          '  ✅ "AI 수요 폭발이 실적을 끌어올렸대."  ← desc_1 마이크론 실적의 이유 심화',
          '  ✅ "근데 다음 분기 전망은 기대를 밑돌았대."  ← 반전이 자연스러울 때',
          '  ❌ "삼성전자·SK하이닉스와 비교 초미세."  ← desc_1과 무관한 내용 금지',
          '  ❌ "근데 문제가" (미완성 문장 금지)',
          'desc_3: desc_1·desc_2 흐름에서 자연스럽게 나오는 짧은 질문. 같은 주체 유지. 반드시 물음표(?)로 끝낼 것.',
          '  ✅ "이번이 진짜 반등 신호일까?"  ← 앞 두 문장을 받아서 나온 질문',
          '  ❌ "시장 반응 어떤가?" (앞 내용과 무관한 막연한 질문)',
          '  ❌ "결과가 궁금해" / "지켜봐야겠어" (물음표 없는 문장 금지)',
          '',
          '[언어 규칙]',
          '일반 독자가 바로 이해할 수 있는 쉬운 한국어 표현 사용. 영어·전문 용어 금지.',
          '비표준 한국어 축약 절대 금지: "올랄까" "갈랄게" "늘랄까" 같이 동사를 잘못 줄인 표현 사용 금지.',
          '  ❌ "계속 올랄까?" → ✅ "계속 오를까?" 또는 "계속 올라갈까?"',
          '  ❌ "더 커질랄까?" → ✅ "더 커질까?"',
          '  ❌ HBM → ✅ AI용 고성능 메모리',
          '  ❌ PCE → ✅ 물가 지수',
          '  ❌ 가이던스 → ✅ 다음 분기 전망',
          '  ❌ 어닝서프라이즈 → ✅ 예상을 뛰어넘은 실적',
          '  ❌ 밸류에이션 → ✅ 주가 수준',
          '  ❌ 컨센서스 → ✅ 시장 예상치',
          '',
          '[팩트 표기 규칙 — 가짜뉴스 방지]',
          '확정 사실(판결·구속·공식 발표·수치)만 단정 서술 가능.',
          '수사 중·의혹·주장·미확정 내용은 반드시 완화 표현 사용.',
          '  ✅ "특검이 징역 1년6개월 구형했대." (공식 구형 — 사실)',
          '  ✅ "근데 명태균 지시 의혹이 나왔대." (수사 중 — 의혹)',
          '  ❌ "근데 명태균이 직접 지시한 거래." (미확정인데 단정 — 금지)',
          '완화 표현 예시: "~혐의가 나왔대", "~의혹이 있대", "~는 주장이야", "~라는 말이 나와"',
          '',
          '[공통 규칙]',
          '각 항목 20자 이내. 반드시 완성된 문장으로 끝낼 것 — 20자가 넘으면 줄이되, 문장은 완성해야 함.',
          'desc_3는 반드시 ? 로 끝날 것 — 이 규칙은 절대 예외 없음.',
          '인물·기업 2개 이상 나열 시 반드시 가운뎃점(·)으로 구분할 것 — 이 규칙은 절대 예외 없음.',
          '  ✅ "삼성전자·SK하이닉스"',
          '  ❌ "삼성전자SK하이닉스" (붙여쓰기 절대 금지)',
          '기업명은 반드시 정식 명칭을 사용할 것. 줄임말 금지.',
          '  ❌ "삼전" → ✅ "삼성전자"',
          '  ❌ "하닉" → ✅ "SK하이닉스"',
          '',
          'JSON (순수 JSON만, 코드블록 없이):',
          '{',
          '  "desc_1": "이슈 핵심 사실 — 마침표(.) 끝",',
          '  "desc_2": "desc_1에서 이어지는 반전·쟁점 — 마침표(.) 끝",',
          '  "desc_3": "흐름에서 나오는 질문 — 반드시 물음표(?) 끝",',
          '  "point_text_01": "이모지 1개 + 핵심 인물·기관 12자 이내 (예: \'🏢 OO기업 임원\')",',
          '  "point_text_02": "이모지 1개 + 핵심 상황·쟁점 12자 이내 (예: \'🚨 부당해고 논란\')"',
          '}',
        ].filter(Boolean).join('\n'),
      },
    ],
    temperature: 0.65,
  })

  const fallbackDesc = issue.topic_description?.split('\n').slice(0, 3).join('\n') ?? '내용을 불러오는 중 오류가 발생했습니다.'

  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned)

    let d1 = fixKoreanContractions(safeStrip(parsed.desc_1 ?? parsed.desc?.split('\n')[0] ?? '', ''))
    let d2 = fixKoreanContractions(safeStrip(parsed.desc_2 ?? parsed.desc?.split('\n')[1] ?? '', ''))
    let d3 = fixKoreanContractions(safeStrip(parsed.desc_3 ?? parsed.desc?.split('\n')[2] ?? '', ''))
    const desc = [d1, d2, d3].filter(Boolean).join('\n') || fallbackDesc

    return {
      desc,
      point_text_01: safeStrip(parsed.point_text_01 ?? '', `📌 ${(issue.topic ?? issue.title).slice(0, 14)}`),
      point_text_02: safeStrip(parsed.point_text_02 ?? '', `📢 지금 주목`),
    }
  } catch (e) {
    console.error(`[generateBadgeContent] 실패 (${issue.title}):`, e)
    console.error('[generateBadgeContent] raw:', res.choices[0].message.content?.slice(0, 200))
    return {
      desc: fallbackDesc,
      point_text_01: `📌 ${(issue.topic ?? issue.title).slice(0, 14)}`,
      point_text_02: `📢 지금 주목`,
    }
  }
}

// ─── 슬라이드 생성 ────────────────────────────────────────

export async function generateTop3Slides(
  issues: Issue[],
  logoBase64: string,
  label = '이번주 핫이슈'
): Promise<SlideContent[]> {
  const keywords = await generateCoverKeywords(issues, 'weekly-top3')
  const coverBg = await fetchPexelsImage(keywords)

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '오늘의 픽',
      main_title: `${label}\nTOP ${issues.length}`,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
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
      logo_image_url: logoBase64,
    })
  }

  slides.push({ type: 'follow', logo_image_url: logoBase64 })
  return slides
}

export async function generateSurgingSlides(issue: Issue, logoBase64: string): Promise<SlideContent[]> {
  const groq = getGroq()
  const surgePctStr = issue.surgePct != null && issue.surgePct > 0
    ? `${Math.round(issue.surgePct)}%`
    : ''

  const [issueContext, coverKeywords] = await Promise.all([
    buildIssueContext(issue),
    generateCoverKeywords([issue], 'surging'),
  ])

  // 콘텐츠 생성
  const contentRes = await groqCreate(groq,{
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_BASE },
      {
        role: 'user',
        content: `/nothink
이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${surgePctStr ? `1시간 사이 화력 ${surgePctStr} 급상승 중` : '실시간 급상승 중'}
${issueContext}

위 이슈의 SNS 카드뉴스 텍스트를 생성해줘. 구어체, AI체 금지, 한자 금지.

[공통 규칙 — 모든 desc 필드]
각 줄은 반드시 서술어("~했어" "~됐어" "~이래" "~거야" "~였대" "~됐대")로 완결된 짧은 구어체 문장.
글자 수에 맞추려고 문장 중간에 줄바꿈 금지. 한 문장은 하나의 줄에서 완결되어야 함.
명사 나열 + 마침표 형태 절대 금지.
  ❌ "마이크론 실적 또 역대급." / ❌ "메모리 수요 급증." / ❌ "코스피가 9000을 넘기 전 마이크론 실적"
  ✅ "마이크론 실적이 역대급을 찍었대." / ✅ "메모리 수요가 폭발적으로 늘었어."
"~궁금해" "~중인대" "~같아" 종결어미 금지. 구어체 사용. AI체·한자 금지.
일반 독자가 바로 이해할 수 있는 쉬운 한국어 사용. 영어·전문 용어 금지.
  ❌ HBM → ✅ AI용 고성능 메모리
  ❌ PCE → ✅ 물가 지수
  ❌ 가이던스 → ✅ 다음 분기 전망
  ❌ 어닝서프라이즈 → ✅ 예상을 뛰어넘은 실적
  ❌ 밸류에이션 → ✅ 주가 수준
  ❌ 컨센서스 → ✅ 시장 예상치
인물·기업 2개 이상 나열 시 반드시 가운뎃점(·)으로 구분 — 절대 예외 없음.
  ✅ "삼성전자·SK하이닉스" ❌ "삼성전자SK하이닉스" (붙여쓰기 절대 금지)

[desc 패턴 — 모든 desc 필드에 적용]
3줄 전체가 하나의 소재에만 집중. 줄1에서 정한 주체(인물/기업/사건)가 줄2·줄3에서도 유지되어야 함.
줄1: 이슈 핵심 사실. 이 슬라이드의 주체를 명시.
줄2: 줄1의 주체에 대한 이유·배경·심화·반전. 새 주체 등장 금지.
줄3: 앞 두 줄 흐름에서 자연스럽게 나오는 질문 + 물음표. 주체 일관성 유지.
✅ 좋은 예: "마이크론 3분기 매출이 예상을 넘었어.\\nAI 수요가 HBM 판매를 끌어올렸어.\\n이번이 진짜 반등 신호일까?"
   → 줄1~3 모두 마이크론에 집중. 주체 바뀌지 않음.
❌ 나쁜 예 (매줄 소재 바뀜): "코스피 9000선 안착했어.\\n마이크론 실적 발표로 관심 쏠려.\\n1만원 고지 넘을 수 있을지 주목해."
   → 줄1: 코스피, 줄2: 마이크론, 줄3: 1만원 — 매줄 주체가 달라짐. 절대 금지.
❌ 나쁜 예 (소재 점프): "마이크론 3분기 매출 346% 급증.\\n삼성전자·SK하이닉스와 순위 비교 중.\\n시장 반응은 어떤가?"
어미 통일: 줄1~3의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 줄마다 다른 스타일 섞으면 절대 금지.
  ❌ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었대." → "~했어"와 "~했대" 혼용. 절대 금지.
  ✅ "마이크론 실적이 역대급을 찍었어.\\nAI 수요 덕분이었어." → 동일 스타일 유지
주어 반복 금지: 주체 명사(인물명·기업명)는 줄1에서만 명시. 줄2·줄3에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.
  ❌ "마이크론 실적이 좋았어.\\n마이크론은 AI 수요 덕분이래." → "마이크론" 반복. 절대 금지.
  ✅ "마이크론 실적이 좋았어.\\nAI 수요 덕분이래." → 주어 생략

[각 슬라이드 역할 — 슬라이드마다 반드시 다른 내용을 다룰 것. 앞 슬라이드에서 한 말 반복 금지.]
badge.desc: "지금 무슨 일?" — 이슈 제목의 핵심 주체(인물·기업·사건)에만 집중. 3줄. 그 주체를 줄1~3에서 계속 다룰 것.
background.desc: "왜 터졌나?" — badge와 다른 각도. 이 이슈의 배경·원인·맥락. 3줄. 인물명·수치 포함. badge와 같은 주체를 다른 측면으로 심화.
controversy.desc: "앞으로 어떻게 되나?" — badge·background와 다른 내용. 현재 쟁점과 향후 전망. 3줄. 마지막 줄 물음표 필수.

badge.point_text_01: 이모지 1개 + 핵심 인물/기관명 12자 이내. 예: "🏢 JTBC 대표"
badge.point_text_02: 이모지 1개 + 핵심 상황/수치 12자 이내. 예: "📉 주가 하루 -30%"
background.sub_title: 배경 소제목 20자 이내.
controversy.sub_title: 쟁점 소제목 20자 이내.

JSON (순수 JSON만, 코드블록 없이):
{
  "badge": {"desc": "...", "point_text_01": "...", "point_text_02": "..."},
  "background": {"sub_title": "...", "desc": "..."},
  "controversy": {"sub_title": "...", "desc": "..."}
}`,
      },
    ],
    temperature: 0.65,
  })

  let content: {
    badge: { desc: string; point_text_01: string; point_text_02: string }
    background: { sub_title: string; desc: string }
    controversy: { sub_title: string; desc: string }
  }

  // 섹션별로 다른 폴백 — topic_description 줄을 나눠 사용
  const topicLines = (issue.topic_description ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const badgeFallback = topicLines.slice(0, 3).join('\n') || (issue.topic ?? issue.title)
  const bgFallback = topicLines.slice(3, 6).join('\n') || topicLines.slice(0, 2).join('\n') || `${issue.title} 관련 배경`
  const controversyFallback = topicLines.slice(6, 9).join('\n') || topicLines.slice(2, 4).join('\n') || `${issue.title} 관련 쟁점`

  try {
    const raw = contentRes.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const d = JSON.parse(cleaned)
    content = {
      badge: {
        desc: safeStrip(d.badge?.desc ?? '', badgeFallback),
        point_text_01: safeStrip(d.badge?.point_text_01 ?? '', `📌 ${issue.title.slice(0, 10)}`),
        point_text_02: safeStrip(d.badge?.point_text_02 ?? '', '🔥 급상승 중'),
      },
      background: {
        sub_title: safeStrip(d.background?.sub_title ?? '', '왜 갑자기 터졌나'),
        desc: safeStrip(d.background?.desc ?? '', bgFallback),
      },
      controversy: {
        sub_title: safeStrip(d.controversy?.sub_title ?? '', '뭐가 문제야'),
        desc: safeStrip(d.controversy?.desc ?? '', controversyFallback),
      },
    }
  } catch {
    content = {
      badge: { desc: badgeFallback, point_text_01: `📌 ${issue.title.slice(0, 10)}`, point_text_02: '🔥 급상승 중' },
      background: { sub_title: '왜 갑자기 터졌나', desc: bgFallback },
      controversy: { sub_title: '뭐가 문제야', desc: controversyFallback },
    }
  }

  const thumbnail = getIssueThumbnail(issue)

  // 슬라이드별 다른 Pexels 이미지를 병렬로 조회
  const [coverBg, bgBg, controversyBg] = await Promise.all([
    fetchPexelsImage(coverKeywords),
    fetchPexelsImage(`${issue.category} breaking news`),
    fetchPexelsImage(`${issue.category} controversy debate`),
  ])

  return [
    {
      type: 'cover',
      sub_title: '실시간 급상승',
      main_title: '지금\n화제 중!',
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
    {
      type: 'badge',
      sub_title: issue.topic ?? issue.title,
      desc: content.badge.desc,
      point_text_01: content.badge.point_text_01,
      point_text_02: surgePctStr ? `📈 ▲ ${surgePctStr}` : content.badge.point_text_02,
      bg_image_url: thumbnail || (bgBg ?? undefined),
      logo_image_url: logoBase64,
    },
    {
      type: 'body',
      sub_title: content.background.sub_title,
      desc: content.background.desc,
      bg_image_url: bgBg ?? thumbnail,
      logo_image_url: logoBase64,
    },
    {
      type: 'body',
      sub_title: content.controversy.sub_title,
      desc: content.controversy.desc,
      bg_image_url: controversyBg ?? thumbnail,
      logo_image_url: logoBase64,
    },
    { type: 'follow', logo_image_url: logoBase64 },
  ]
}

export async function generateCategorySlides(issues: Issue[], logoBase64: string): Promise<SlideContent[]> {
  const keywords = await generateCoverKeywords(issues, 'by-category')
  const coverBg = await fetchPexelsImage(keywords)

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '카테고리별 정리',
      main_title: '분야별\n핫이슈',
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
  ]

  for (const issue of issues) {
    const content = await generateBadgeContent(issue, `${issue.category} 분야 최고 화력 이슈입니다.`)
    slides.push({
      type: 'badge',
      sub_title: issue.topic ?? issue.title,
      desc: content.desc,
      point_text_01: content.point_text_01,
      point_text_02: content.point_text_02,
      bg_image_url: getIssueThumbnail(issue),
      logo_image_url: logoBase64,
    })
  }

  slides.push({ type: 'follow', logo_image_url: logoBase64 })
  return slides
}

export async function generateTimelineSlides(issue: ClosedIssue, logoBase64: string): Promise<SlideContent[]> {
  const groq = getGroq()
  const bg = getIssueThumbnail(issue)

  // 단계 순서 정렬 후 AI 컨텍스트용 요약 구성 (단계별 대표 포인트 2개씩)
  const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3, '종결': 4 }
  const grouped = new Map<string, TimelinePoint[]>()
  for (const p of issue.timelinePoints) {
    if (!grouped.has(p.stage)) grouped.set(p.stage, [])
    grouped.get(p.stage)!.push(p)
  }
  const sortedStages = Array.from(grouped.keys()).sort(
    (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
  )

  // 이슈 키워드 2개 이상 포함된 포인트만 남겨 관련 없는 인물·사건 차단
  const tlKeywords = extractKeywords(issue)
  const tlMinMatch = minMatchRequired(tlKeywords)
  const stagesSummary = sortedStages
    .map(stage => {
      const pts = grouped.get(stage)!
        .filter(p => keywordMatchCount(p.title, tlKeywords) >= tlMinMatch)
        .slice(0, 2)
        .map(p => stripNonKorean(p.title))
      if (pts.length === 0) return null
      return `[${stage}]\n${pts.join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')

  // 커버 키워드 + 콘텐츠 3장 + 배경 이미지를 병렬로
  const [coverKeywords, res] = await Promise.all([
    generateCoverKeywords([issue], 'timeline'),
    groqCreate(groq,{
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `/nothink
이슈: "${issue.title}"

타임라인 참고 (절대 그대로 복사 금지 — 핵심 팩트만 뽑아 새 문장으로. 아래 데이터에 없는 인물·사건은 추가 금지):
${stagesSummary}

이 이슈를 기승전결 3장 스토리로 써줘. 친구한테 이 사건 이야기를 카톡으로 전달하는 것처럼 자연스럽게.

[기승전결 구조]
슬라이드 1 (기) = 이 사건이 어떻게 시작됐는지
슬라이드 2 (승·전) = 어떻게 커지고 무슨 반전이 있었는지
슬라이드 3 (결) = 결말이 어떻게 됐는지

[hook]
- 15자 이내. 이슈 내용에서 뽑은 구체적 문구. 단어 사이 반드시 공백.
- 하나의 소재에만 집중. 두 소재를 합치거나 이어 붙이지 말 것.
  ❌ "코스피9000마이크론" (두 소재 공백 없이 합침), "PCE마이크론" (붙여쓰기)
  ✅ "마이크론 실적 발표", "코스피 상승세 확인"
- 나쁜 예 (절대 금지): "그래서...", "결국엔...", "근데 갑자기", "그런데", "이렇게"
- 좋은 예: 이슈 속 핵심 장면이나 상황을 한 줄로 — "이재가 나선 이유", "논란이 터진 순간", "팬들 반응은 달랐어"
- 1장: 사건이 시작된 장면·계기. 2장: 1장에서 이어지는 전개. 3장: 결말·마무리.

[desc]
- 3문장. \\n 구분. 반드시 서술어("~했어" "~됐어" "~이래" "~거야" "~됐대")로 완결된 짧은 구어체 문장.
- 글자 수에 맞추려고 문장 중간에 줄바꿈 금지. 한 문장은 하나의 줄에서 완결.
  ❌ "마이크론 3분기 실적이 기대를 크게" (서술어 없이 잘린 문장) 절대 금지
  ❌ "AI 수요가 실적 주도." → ✅ "AI 수요가 실적을 끌어올린 거야."
- 3문장 전체가 하나의 소재에 집중. 문장1에서 정한 주체(인물/기업/사건)가 문장2·3에서도 유지되어야 함.
- 매 문장 주체가 달라지는 것은 절대 금지.
  ❌ "PCE 물가 지표가 관심 포인트야.\\n마이크론 실적이 반도체 주가에 영향 미칠까.\\n코스피 반등 신호탄 쏘았어." → 문장마다 소재 바뀜
  ✅ "마이크론 3분기 매출이 86억 달러였어.\\nAI 수요가 HBM 판매를 폭발시킨 거야.\\n시장 예상치를 훨씬 넘어선 결과야." → 마이크론에 집중
- 어미 통일: 3문장의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 문장마다 다른 스타일 섞으면 절대 금지.
- 주어 반복 금지: 주체 명사(인물명·기업명)는 문장1에서만 명시. 문장2·3에서는 주어를 생략할 것 — 매 문장 같은 명사를 반복하면 기계적으로 들려서 금지.
  ❌ "마이크론 실적이 좋았어.\\n마이크론은 AI 수요 덕분이래." → "마이크론" 반복. 절대 금지.
  ✅ "마이크론 실적이 좋았어.\\nAI 수요 덕분이래." → 주어 생략
- 구체적 인물명·수치 포함. 구어체("~했대" "~됐어" "~인 거야").
- 외국인 이름은 반드시 한글 발음으로 표기 (예: vân → 반). 알파벳 그대로 쓰지 말 것.
- 인물·기업 2개 이상 나열 시 반드시 가운뎃점(·)으로 구분. ✅ "삼성전자·SK하이닉스"
- 영어·전문 용어 금지. 쉬운 한국어 표현 사용.
  ❌ HBM → ✅ AI용 고성능 메모리 / ❌ PCE → ✅ 물가 지수 / ❌ 가이던스 → ✅ 다음 분기 전망
- 1·2장 마지막 문장은 다음 장이 궁금해지는 브리지. 3장 마지막은 여운·마무리.

pexels_keywords: 이 슬라이드 배경사진용 영어 2-3단어.

JSON (순수 JSON만, 코드블록 없이):
{
  "slides": [
    {"hook": "...", "desc": "...", "pexels_keywords": "..."},
    {"hook": "...", "desc": "...", "pexels_keywords": "..."},
    {"hook": "...", "desc": "...", "pexels_keywords": "..."}
  ]
}`,
        },
      ],
      temperature: 0.7,
    }),
  ])

  // 파싱
  type StorySlide = { hook: string; desc: string; pexels_keywords?: string }
  let storySlides: StorySlide[] = []
  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned).slides ?? []
  const hookFallbacks = ['이렇게 시작됐어', '이게 커진 이유가', '결국 이렇게 됐어']
    storySlides = (parsed as StorySlide[]).slice(0, 3).map((s, i) => ({
      hook: safeStrip(s.hook ?? '', hookFallbacks[i] ?? '이렇게 됐어'),
      desc: safeStrip(s.desc ?? '', issue.topic ?? issue.title),
      pexels_keywords: s.pexels_keywords,
    }))
  } catch {
    storySlides = [
      { hook: '이렇게 시작됐어', desc: issue.topic ?? issue.title },
      { hook: '이게 커진 이유가', desc: issue.topic ?? issue.title },
      { hook: '결국 이렇게 됐어', desc: issue.topic ?? issue.title },
    ]
  }

  // 배경 이미지 병렬 조회
  const [coverBg, ...slideBgs] = await Promise.all([
    fetchPexelsImage(coverKeywords),
    ...storySlides.map(s => fetchPexelsImage(s.pexels_keywords ?? `${issue.category} news`)),
  ])

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '처음부터 끝까지',
      main_title: breakCoverTitle(issue.title),
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
    ...storySlides.map((s, i) => ({
      type: 'body' as const,
      sub_title: s.hook,
      desc: s.desc,
      bg_image_url: slideBgs[i] ?? bg,
      logo_image_url: logoBase64,
    })),
    { type: 'follow' as const, logo_image_url: logoBase64 },
  ]

  return slides
}

// ─── Q&A 슬라이드 ────────────────────────────────────────

export async function generateQASlides(issue: Issue, logoBase64: string): Promise<SlideContent[]> {
  const groq = getGroq()
  const thumbnail = getIssueThumbnail(issue)

  // 컨텍스트 + 커버 키워드 병렬
  const [issueContext, coverKeywords] = await Promise.all([
    buildIssueContext(issue),
    generateCoverKeywords([issue], 'qa'),
  ])

  const [res] = await Promise.all([
    groqCreate(groq,{
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `/nothink
이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${issue.topic ? `주제: ${issue.topic}` : ''}
${issueContext}

"이게 도대체 무슨 일이야?" 하고 묻는 친구에게 설명해주듯 Q&A 3개 생성해줘.
Q1=무슨 일이야(배경+사실), Q2=왜 난리야(쟁점+반응), Q3=앞으로 어떻게 돼(전망)

[각 필드 기준]
question: SNS 댓글처럼 짧고 자연스러운 질문. 15자 이내.
answer: 구어체 3줄("~이래" "~했대" "~인 거야"). \\n 구분. 반드시 서술어로 완결된 짧은 문장. 글자 수 맞추려고 문장 중간 줄바꿈 금지.
  1줄에서 정한 주체(인물/기업/사건)가 2줄·3줄에서도 유지되어야 함. 줄마다 주체가 달라지면 절대 안 됨.
  ❌ "마이크론 실적 발표 났대.\\n코스피 9000 넘었어.\\n시장 반응 어떤가?" → 줄마다 소재 바뀜
  ✅ "마이크론 3분기 매출이 예상을 넘었대.\\nAI 수요가 HBM 판매를 끌어올렸대.\\n이번이 진짜 반등 신호일까?"
  1줄=구체적 사실(인물명/기관명/수치) + 마침표.
  2줄=1줄의 주체에 대한 이유·배경·심화·반전 + 마침표.
  3줄=앞 두 줄에서 자연스럽게 나오는 전망 또는 질문.
  어미 통일: 1·2줄의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 섞으면 절대 금지.
  주어 반복 금지: 주체 명사(인물명·기업명)는 1줄에서만 명시. 2·3줄에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.
  인물·기업 2개 이상 나열 시 반드시 가운뎃점(·)으로 구분. ✅ "삼성전자·SK하이닉스"
  영어·전문 용어 금지. ❌ "가이던스" → ✅ "다음 분기 전망"
pexels_keywords: 슬라이드 배경사진용 영어 키워드 2-3개.

JSON (순수 JSON만, 코드블록 없이):
{
  "qa": [
    {"question": "...", "answer": "...", "pexels_keywords": "..."},
    {"question": "...", "answer": "...", "pexels_keywords": "..."},
    {"question": "...", "answer": "...", "pexels_keywords": "..."}
  ]
}`,
        },
      ],
      temperature: 0.75,
    }),
  ])

  const qaFallback = issue.topic_description?.split('\n').slice(0, 3).join('\n') ?? '정보를 불러오는 중 오류가 발생했습니다.'

  let qa: Array<{ question: string; answer: string; pexels_keywords?: string }> = []
  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned).qa ?? []
    qa = parsed.map((item: { question: string; answer: string; pexels_keywords?: string }) => ({
      question: safeStrip(item.question ?? '', '무슨 일이야?'),
      answer: safeStrip(item.answer ?? '', qaFallback),
      pexels_keywords: item.pexels_keywords,
    }))
  } catch {
    qa = [{ question: '무슨 일이야?', answer: qaFallback }]
  }

  // 커버 + 각 슬라이드 배경 이미지를 병렬로
  const [coverBg, ...slideBgs] = await Promise.all([
    fetchPexelsImage(coverKeywords),
    ...qa.map(item => fetchPexelsImage(item.pexels_keywords ?? `${issue.category} news`)),
  ])

  const slides: SlideContent[] = [
    {
      type: 'cover',
      sub_title: '이게 왜 난리야?',
      main_title: issue.topic ?? issue.title,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
  ]

  qa.forEach((item, i) => {
    slides.push({
      type: 'body',
      sub_title: item.question,
      desc: item.answer,
      bg_image_url: slideBgs[i] ?? thumbnail,
      logo_image_url: logoBase64,
    })
  })

  slides.push({ type: 'follow', logo_image_url: logoBase64 })
  return slides
}

// ─── 찬반 슬라이드 ───────────────────────────────────────

export async function generateDebateSlides(issue: Issue, logoBase64: string): Promise<SlideContent[]> {
  const groq = getGroq()
  const thumbnail = getIssueThumbnail(issue)

  // 컨텍스트 + 커버 키워드 병렬
  const [issueContext, coverKeywords] = await Promise.all([
    buildIssueContext(issue),
    generateCoverKeywords([issue], 'debate'),
  ])

  const [res] = await Promise.all([
    groqCreate(groq,{
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `/nothink
이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${issue.topic ? `주제: ${issue.topic}` : ''}
${issueContext}

이 이슈의 찬반 논쟁을 카드뉴스로 만들어줘. 팩트·수치·실제 주장 기반으로.

[공통 언어 규칙]
영어·전문 용어 금지. 일반 독자가 바로 이해할 수 있는 쉬운 한국어 표현 사용.
인물·기업 2개 이상 나열 시 반드시 가운뎃점(·)으로 구분. ✅ "삼성전자·SK하이닉스"

[각 필드 기준]
pro.label: 찬성 측 핵심 입장 15자 이내.
pro.points: 찬성 주장 3줄. \\n 구분. 구체적 논거/수치/사례. "~야" "~거야" 어조. 반드시 서술어로 완결. 글자 수 맞추려고 문장 중간 줄바꿈 금지.
  줄1의 주체(인물/기업/사건)가 줄2·3에서도 유지. 줄마다 주체가 달라지면 절대 안 됨.
  줄1=핵심 사실·근거. 줄2=줄1의 주체에 대한 이유·배경. 줄3=앞 흐름에서 나오는 전망·결론.
  어미 통일: 줄1·2의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 섞으면 절대 금지.
  주어 반복 금지: 주체 명사(인물명·기업명)는 줄1에서만 명시. 줄2·3에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.
  ✅ "마이크론 346% 성장을 기록했어.\\nAI 반도체 수요가 폭발한 덕분이야.\\n이 추세 당분간 이어질 거야."
pro.pexels_keywords: 찬성 슬라이드 배경사진용 영어 키워드 2-3개.
con.label: 반대 측 핵심 입장 15자 이내.
con.points: 반대 주장 3줄. \\n 구분. 구체적 논거/수치/사례. 반드시 서술어로 완결. 글자 수 맞추려고 문장 중간 줄바꿈 금지.
  줄1의 주체(인물/기업/사건)가 줄2·3에서도 유지. 줄마다 주체가 달라지면 절대 안 됨.
  줄1=핵심 사실·근거. 줄2=줄1의 주체에 대한 이유·배경. 줄3=앞 흐름에서 나오는 전망·결론.
  어미 통일: 줄1·2의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 섞으면 절대 금지.
  주어 반복 금지: 주체 명사(인물명·기업명)는 줄1에서만 명시. 줄2·3에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.
  ✅ "삼성전자·SK하이닉스가 뒤처지고 있어.\\n마이크론보다 수익성이 낮거든.\\nHBM 경쟁 격차 더 벌어질 수 있어."
con.pexels_keywords: 반대 슬라이드 배경사진용 영어 키워드 2-3개.
status.sub_title: 논란 현황 소제목 20자 이내.
status.desc: 현재 상황 3줄. \\n 구분. 반드시 서술어로 완결. 글자 수 맞추려고 문장 중간 줄바꿈 금지.
  3줄이 하나의 이야기처럼 이어질 것. 줄1=현재 상황 사실, 줄2=대립 핵심, 줄3=앞으로 어떻게 될지(물음표 권장).
  어미 통일: 줄1·2의 종결 스타일을 하나로 통일할 것 — "~했어"·"~됐어" 계열 또는 "~했대"·"~거래" 계열 중 하나만 사용. 섞으면 절대 금지.
  주어 반복 금지: 주체 명사(인물명·기업명)는 줄1에서만 명시. 줄2·3에서는 주어를 생략할 것 — 매줄 같은 명사를 반복하면 기계적으로 들려서 금지.
status.pexels_keywords: 현황 슬라이드 배경사진용 영어 키워드 2-3개.

JSON (순수 JSON만, 코드블록 없이):
{
  "pro": {"label": "...", "points": "...", "pexels_keywords": "..."},
  "con": {"label": "...", "points": "...", "pexels_keywords": "..."},
  "status": {"sub_title": "...", "desc": "...", "pexels_keywords": "..."}
}`,
        },
      ],
      temperature: 0.75,
    }),
  ])

  let debateParsed: {
    pro: { label: string; points: string; pexels_keywords?: string }
    con: { label: string; points: string; pexels_keywords?: string }
    status: { sub_title: string; desc: string; pexels_keywords?: string }
  } | null = null

  const debateFallback = issue.topic_description?.split('\n').slice(0, 3).join('\n') ?? issue.topic ?? issue.title

  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const d = JSON.parse(cleaned)
    debateParsed = {
      pro: { label: safeStrip(d.pro?.label ?? '', '찬성 측'), points: safeStrip(d.pro?.points ?? '', debateFallback), pexels_keywords: d.pro?.pexels_keywords },
      con: { label: safeStrip(d.con?.label ?? '', '반대 측'), points: safeStrip(d.con?.points ?? '', debateFallback), pexels_keywords: d.con?.pexels_keywords },
      status: { sub_title: safeStrip(d.status?.sub_title ?? '', '현재 상황'), desc: (() => {
        const lines = safeStrip(d.status?.desc ?? '', debateFallback).split('\n')
        if (lines.length > 0 && !lines[lines.length - 1].endsWith('?')) {
          lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…~]*$/, '') + '?'
        }
        return lines.join('\n')
      })(), pexels_keywords: d.status?.pexels_keywords },
    }
  } catch {
    debateParsed = null
  }

  // 커버 + 각 슬라이드 배경 이미지를 병렬로
  const [coverBg, proBg, conBg, statusBg] = await Promise.all([
    fetchPexelsImage(coverKeywords),
    fetchPexelsImage(debateParsed?.pro.pexels_keywords ?? `${issue.category} support`),
    fetchPexelsImage(debateParsed?.con.pexels_keywords ?? `${issue.category} protest`),
    fetchPexelsImage(debateParsed?.status.pexels_keywords ?? `${issue.category} balance`),
  ])

  return [
    {
      type: 'cover',
      sub_title: '찬반 논란 정리',
      main_title: issue.topic ?? issue.title,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
    {
      type: 'body',
      sub_title: debateParsed?.pro.label ?? '찬성 측',
      desc: debateParsed?.pro.points ?? '정보를 불러오는 중 오류가 발생했습니다.',
      bg_image_url: proBg ?? thumbnail,
      logo_image_url: logoBase64,
    },
    {
      type: 'body',
      sub_title: debateParsed?.con.label ?? '반대 측',
      desc: debateParsed?.con.points ?? '정보를 불러오는 중 오류가 발생했습니다.',
      bg_image_url: conBg ?? thumbnail,
      logo_image_url: logoBase64,
    },
    {
      type: 'badge',
      sub_title: debateParsed?.status.sub_title ?? '현재 상황',
      desc: debateParsed?.status.desc ?? '',
      point_text_01: `⚖️ 찬반 대립`,
      point_text_02: `📢 논란 진행 중`,
      bg_image_url: statusBg ?? thumbnail,
      logo_image_url: logoBase64,
    },
    { type: 'follow', logo_image_url: logoBase64 },
  ]
}

// ─── 숫자형 슬라이드 ─────────────────────────────────────

export async function generateNumbersSlides(issue: Issue, logoBase64: string): Promise<SlideContent[]> {
  const groq = getGroq()
  const thumbnail = getIssueThumbnail(issue)

  const [issueContext, coverKeywords] = await Promise.all([
    buildIssueContext(issue),
    generateCoverKeywords([issue], 'by-numbers'),
  ])

  const res = await groqCreate(groq,{
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: SYSTEM_BASE },
      {
        role: 'user',
        content: `/nothink
이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${issue.topic ? `주제: ${issue.topic}` : ''}
${issueContext}

이 이슈를 핵심 수치·숫자 3개로 설명하는 SNS 카드뉴스를 만들어줘.
수치는 반드시 위 내용에 실제로 등장하는 팩트여야 해. 없는 숫자 절대 만들지 말 것.
숫자가 부족하면 기간·횟수·순위·날짜 같은 수치로 채울 것.

[각 필드 기준]
number: 핵심 수치. 최대 8자. 단위 포함. 임팩트 있게.
  ✅ "1.2조원" "징역 8년" "2,400명" "▲346%" "역대 1위"
  ❌ "약 1조원대" (애매함) "많다" (수치 아님) "10자 초과하는 긴 숫자 표현"
label: 이 숫자가 뭘 뜻하는지 한 마디. 최대 10자.
  ✅ "피해 추정액" "검찰 구형량" "피해자 수"
desc: 이 숫자의 맥락. 구어체 2문장. \\n 구분. 반드시 서술어로 완결.
  1줄: 이 숫자가 왜 중요한지 (마침표로 끝낼 것)
  2줄: 독자가 체감할 비교·배경 (마침표 또는 물음표로 끝낼 것)
  ❌ 문장 중간 줄바꿈 금지. 한 문장은 하나의 줄에서 완결.
pexels_keywords: 슬라이드 배경사진용 영어 키워드 2-3개.

[공통 규칙]
영어·전문 용어 금지. 구어체. 사실에 없는 수치 절대 금지.
인물·기업 2개 이상 나열 시 가운뎃점(·)으로 구분.

JSON (순수 JSON만, 코드블록 없이):
{
  "numbers": [
    {"number": "...", "label": "...", "desc": "...", "pexels_keywords": "..."},
    {"number": "...", "label": "...", "desc": "...", "pexels_keywords": "..."},
    {"number": "...", "label": "...", "desc": "...", "pexels_keywords": "..."}
  ]
}`,
      },
    ],
    temperature: 0.5,
  })

  type NumberItem = { number: string; label: string; desc: string; pexels_keywords?: string }
  let numbers: NumberItem[] = []

  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned).numbers ?? []
    numbers = (parsed as NumberItem[]).slice(0, 3).map(n => ({
      number: safeStrip(n.number ?? '', '?', 1),
      label: safeStrip(n.label ?? '', '핵심 수치'),
      desc: safeStrip(n.desc ?? '', issue.topic ?? issue.title),
      pexels_keywords: n.pexels_keywords,
    }))
  } catch {
    numbers = [{ number: '?', label: '핵심 수치', desc: issue.topic ?? issue.title }]
  }

  const [coverBg, ...slideBgs] = await Promise.all([
    fetchPexelsImage(coverKeywords),
    ...numbers.map(n => fetchPexelsImage(n.pexels_keywords ?? `${issue.category} data statistics`)),
  ])

  return [
    {
      type: 'cover',
      sub_title: '숫자로 읽는 이슈',
      main_title: issue.topic ?? issue.title,
      bg_image_url: coverBg ?? undefined,
      logo_image_url: logoBase64,
    },
    ...numbers.map((n, i) => ({
      type: 'numbers' as const,
      main_title: n.number,
      sub_title: n.label,
      desc: n.desc,
      bg_image_url: slideBgs[i] ?? thumbnail,
      logo_image_url: logoBase64,
    })),
    { type: 'follow' as const, logo_image_url: logoBase64 },
  ]
}

// ─── 단일 이슈 슬라이드 생성 (관리자 수동용) ──────────────

export async function generateSlidesForIssue(
  issueId: string,
  mode: 'surging' | 'timeline' | 'qa' | 'debate' | 'by-numbers',
  logoBase64: string,
): Promise<SlideContent[]> {
  if (mode === 'timeline') {
    const issue = await fetchIssueWithTimeline(issueId)
    if (!issue) throw new Error('이슈를 찾을 수 없습니다.')
    return generateTimelineSlides(issue, logoBase64)
  }

  const issue = await fetchIssueById(issueId)
  if (!issue) throw new Error('이슈를 찾을 수 없습니다.')

  if (mode === 'surging') return generateSurgingSlides(issue, logoBase64)
  if (mode === 'qa') return generateQASlides(issue, logoBase64)
  if (mode === 'by-numbers') return generateNumbersSlides(issue, logoBase64)
  if (mode === 'debate') return generateDebateSlides(issue, logoBase64)

  throw new Error(`지원하지 않는 모드: ${mode}`)
}
