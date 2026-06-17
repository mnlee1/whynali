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
  return new Groq({ apiKey: process.env.GROQ_API_KEY!.split(',')[0].trim() })
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

export const SINGLE_ISSUE_MODES: ContentMode[] = ['surging', 'timeline', 'qa', 'debate']

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
  type: 'cover' | 'body' | 'badge' | 'follow'
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
3. 구어체 사용: "~야" "~이래" "~거야" "~했대" "~대" "~인 거야" "~했어" "~됐어" 처럼 자연스럽게.
4. 각 줄은 구체적으로: 인물명·기관명·수치·사건명을 직접 언급. 추상적 서술("논란이 일고 있다", "화제가 됐다") 금지.
5. 줄 사이는 접속사("근데" "그런데" "결국" "하지만" "그래서")로 자연스럽게 연결.`

const SEVEN_DAYS_AGO = () =>
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

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
function truncateDescLine(line: string, maxLen = 22): string {
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
  const stripped = stripNonKorean(text).trim()
  return stripped.length >= minLen ? stripped : fallback
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
  }
  return fs.readFileSync(path.join(TEMPLATE_DIR, fileMap[type]), 'utf-8')
}

export function fillTemplate(template: string, slide: SlideContent): string {
  return template
    .replace(/\{\{bg_image_url\}\}/g, slide.bg_image_url || '')
    .replace(/\{\{main_title\}\}/g, escapeHtml(normalizeNewlines(slide.main_title || '')))
    .replace(/\{\{sub_title\}\}/g, escapeHtml(normalizeNewlines(slide.sub_title || '')))
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
    .select('id, title, category, thumbnail_urls, primary_thumbnail_index, heat_index, heat_index_1h_ago, topic, topic_description')
    .eq('approval_status', '승인')
    .eq('visibility_status', 'visible')
    .neq('status', '종결')
    .is('merged_into_id', null)
    .gte('updated_at', SEVEN_DAYS_AGO())
    .not('heat_index_1h_ago', 'is', null)
    .gt('heat_index_1h_ago', 0)
    .order('heat_index', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`)

  const candidates = ((data || []) as Issue[]).filter(i => !excludeIds.has(i.id))
  const withSurge = candidates
    .map(i => ({
      ...i,
      surgePct: ((i.heat_index ?? 0) - (i.heat_index_1h_ago ?? 0)) / (i.heat_index_1h_ago ?? 1) * 100,
    }))
    .filter(i => i.surgePct > 0)
    .sort((a, b) => b.surgePct - a.surgePct)

  return withSurge[0] ?? (candidates[0] ? { ...candidates[0], surgePct: 0 } : null)
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

export async function generateCoverKeywords(issues: Issue[], mode: ContentMode): Promise<string> {
  const groq = getGroq()
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

export async function generateStageKeywords(issue: Issue, stage: string, points: TimelinePoint[]): Promise<string> {
  const groq = getGroq()
  const pointTitles = points.slice(0, 3).map(p => p.title).join(', ')
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You are a stock photo search expert. Return ONLY valid JSON.' },
      {
        role: 'user',
        content: `Korean news issue: "${issue.title}" — stage: ${stage}\nKey events: ${pointTitles}\n\nGenerate 2-3 English keywords for a Pexels portrait photo that visually represents this stage's mood or theme.\nReturn JSON only: {"keywords": "2-3 english words"}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 60,
  })
  try {
    const raw = res.choices[0].message.content ?? '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned).keywords ?? issue.category
  } catch {
    return issue.category
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

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
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
          '[desc 작성법]',
          '- 3줄. 한 문단처럼 이어지게.',
          '- 1줄: 뉴스 헤드라인에서 뽑은 구체적 사실(인물명/기관명/수치/사건명) 포함. "~했대." "~이래." 처럼 끝내기.',
          '- 2줄: "근데" "그런데" "결국" 같은 접속사로 시작하며 반전·쟁점 추가.',
          '- 3줄: "~일까?" "~는 건지?" "~할 수 있을까?" 처럼 물음표로 끝내 궁금증 유발.',
          '- 각 줄 22자 이내. 줄바꿈은 \\n.',
          '',
          '[나쁜 예 — 절대 금지]',
          '"논란이 일고 있다\\n많은 관심이 쏟아지고 있다\\n귀추가 주목된다"',
          '→ 주어 없음, 구체성 없음, AI체, 물음표 없음',
          '',
          '[좋은 예]',
          '"OO기업 임원이 부당해고를 지시했대.\\n근데 피해자가 5명이나 폭로하고 나섰어.\\n회사 측 해명, 믿을 수 있을까?"',
          '→ 구체적, 구어체, 물음표 마무리',
          '',
          'JSON (순수 JSON만, 코드블록 없이):',
          '{',
          '  "desc": "3줄 설명 (\\n 구분)",',
          '  "point_text_01": "핵심 인물·기관 구 — 이모지 1개 포함, 이모지 제외 12자 이내 (예: \'🏢 OO기업 임원\')",',
          '  "point_text_02": "핵심 상황·쟁점 구 — point_text_01과 다른 이모지 1개 포함, 이모지 제외 12자 이내 (예: \'🚨 부당해고 논란\')"',
          '}',
        ].filter(Boolean).join('\n'),
      },
    ],
    temperature: 0.75,
  })

  const fallbackDesc = issue.topic_description?.split('\n').slice(0, 3).join('\n') ?? '내용을 불러오는 중 오류가 발생했습니다.'

  try {
    const raw = res.choices[0].message.content || '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      desc: safeStrip(parsed.desc ?? '', fallbackDesc),
      point_text_01: safeStrip(parsed.point_text_01 ?? '', `📌 ${(issue.topic ?? issue.title).slice(0, 14)}`),
      point_text_02: safeStrip(parsed.point_text_02 ?? '', `📢 지금 주목`),
    }
  } catch {
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
  const contentRes = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_BASE },
      {
        role: 'user',
        content: `이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${surgePctStr ? `1시간 사이 화력 ${surgePctStr} 급상승 중` : '실시간 급상승 중'}
${issueContext}

위 이슈의 SNS 카드뉴스 텍스트를 생성해줘. 구어체, AI체 금지, 한자 금지.

[각 필드 기준]
badge.desc: 핵심 요약 3줄. 각 18자 이내. \\n 구분. 1줄=구체적 사실("~했대" "~이래"), 2줄=접속사로 반전/쟁점, 3줄=물음표 마무리.
badge.point_text_01: 이모지 1개 + 핵심 인물/기관명 12자 이내. 예: "🏢 JTBC 대표"
badge.point_text_02: 이모지 1개 + 핵심 상황/수치 12자 이내. 예: "📉 주가 하루 -30%"
background.sub_title: 이슈 배경 소제목 20자 이내.
background.desc: 배경 3줄. 각 18자 이내. \\n 구분. 구체적 사실/인물명/수치 포함.
controversy.sub_title: 현재 쟁점 소제목 20자 이내.
controversy.desc: 쟁점 3줄. 각 18자 이내. \\n 구분. 3번째 줄은 전망/물음표.

JSON (순수 JSON만, 코드블록 없이):
{
  "badge": {"desc": "...", "point_text_01": "...", "point_text_02": "..."},
  "background": {"sub_title": "...", "desc": "..."},
  "controversy": {"sub_title": "...", "desc": "..."}
}`,
      },
    ],
    temperature: 0.75,
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
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
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
      point_text_02: `🏆 분야 1위`,
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
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `이슈: "${issue.title}"

타임라인 참고 (절대 그대로 복사 금지 — 핵심 팩트만 뽑아 새 문장으로. 아래 데이터에 없는 인물·사건은 추가 금지):
${stagesSummary}

이 이슈를 기승전결 3장 스토리로 써줘. 친구한테 이 사건 이야기를 카톡으로 전달하는 것처럼 자연스럽게.

[기승전결 구조]
슬라이드 1 (기) = 이 사건이 어떻게 시작됐는지
슬라이드 2 (승·전) = 어떻게 커지고 무슨 반전이 있었는지
슬라이드 3 (결) = 결말이 어떻게 됐는지

[hook]
- 15자 이내. 이슈 내용에서 뽑은 구체적 문구.
- 나쁜 예 (절대 금지): "그래서...", "결국엔...", "근데 갑자기", "그런데", "이렇게"
- 좋은 예: 이슈 속 핵심 장면이나 상황을 한 줄로 — "이재가 나선 이유", "논란이 터진 순간", "팬들 반응은 달랐어"
- 1장: 사건이 시작된 장면·계기. 2장: 1장에서 이어지는 전개. 3장: 결말·마무리.

[desc]
- 각 18자 이내 3문장. \\n 구분.
- 구조를 맞추려 하지 말고, 이 장에서 일어난 일을 자연스럽게 이어지는 3문장으로.
- 구체적 인물명·수치 포함. 구어체("~했대" "~됐어" "~인 거야").
- 외국인 이름은 반드시 한글 발음으로 표기 (예: vân → 반). 알파벳 그대로 쓰지 말 것.
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
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
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
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${issue.topic ? `주제: ${issue.topic}` : ''}
${issueContext}

"이게 도대체 무슨 일이야?" 하고 묻는 친구에게 설명해주듯 Q&A 3개 생성해줘.
Q1=무슨 일이야(배경+사실), Q2=왜 난리야(쟁점+반응), Q3=앞으로 어떻게 돼(전망)

[각 필드 기준]
question: SNS 댓글처럼 짧고 자연스러운 질문. 15자 이내.
answer: 구어체 3줄("~이래" "~했대" "~인 거야"). 각 18자 이내. \\n 구분.
  1줄=구체적 사실(인물명/기관명/수치), 2줄=접속사+쟁점/반응, 3줄=전망 또는 물음표 마무리.
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
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
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
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        {
          role: 'user',
          content: `이슈 제목: "${issue.title}"
카테고리: ${issue.category}
${issue.topic ? `주제: ${issue.topic}` : ''}
${issueContext}

이 이슈의 찬반 논쟁을 카드뉴스로 만들어줘. 팩트·수치·실제 주장 기반으로.

[각 필드 기준]
pro.label: 찬성 측 핵심 입장 15자 이내.
pro.points: 찬성 주장 3줄. 각 18자 이내. \\n 구분. 구체적 논거/수치/사례. "~야" "~거야" 어조.
pro.pexels_keywords: 찬성 슬라이드 배경사진용 영어 키워드 2-3개.
con.label: 반대 측 핵심 입장 15자 이내.
con.points: 반대 주장 3줄. 각 18자 이내. \\n 구분. 구체적 논거/수치/사례.
con.pexels_keywords: 반대 슬라이드 배경사진용 영어 키워드 2-3개.
status.sub_title: 논란 현황 소제목 20자 이내.
status.desc: 현재 상황 3줄. 각 18자 이내. \\n 구분. 대립 상황+앞으로 어떻게 될지 포함.
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
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const d = JSON.parse(cleaned)
    debateParsed = {
      pro: { label: safeStrip(d.pro?.label ?? '', '찬성 측'), points: safeStrip(d.pro?.points ?? '', debateFallback), pexels_keywords: d.pro?.pexels_keywords },
      con: { label: safeStrip(d.con?.label ?? '', '반대 측'), points: safeStrip(d.con?.points ?? '', debateFallback), pexels_keywords: d.con?.pexels_keywords },
      status: { sub_title: safeStrip(d.status?.sub_title ?? '', '현재 상황'), desc: safeStrip(d.status?.desc ?? '', debateFallback), pexels_keywords: d.status?.pexels_keywords },
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

// ─── 단일 이슈 슬라이드 생성 (관리자 수동용) ──────────────

export async function generateSlidesForIssue(
  issueId: string,
  mode: 'surging' | 'timeline' | 'qa' | 'debate',
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
  if (mode === 'debate') return generateDebateSlides(issue, logoBase64)

  throw new Error(`지원하지 않는 모드: ${mode}`)
}
