/**
 * lib/pipeline/issue-pipeline.ts
 *
 * track-a와 수동 등록에서 공통으로 사용하는 파이프라인 함수들
 */

import { callClaude } from '@/lib/ai/claude-client'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { shouldSkipDueToRateLimit, recordRateLimitSuccess, recordRateLimitFailure } from '@/lib/ai/rate-limit-priority'
import { supabaseAdmin } from '@/lib/supabase-server'
import type { IssueCategory } from '@/lib/config/categories'

export class AllKeysRateLimitedError extends Error {
    constructor(message: string = '모든 Groq API 키가 Rate Limit 상태입니다') {
        super(message)
        this.name = 'AllKeysRateLimitedError'
    }
}

export interface AIVerificationResult {
    isIssue: boolean
    confidence: number
    reason: string
    searchKeyword: string
    category: IssueCategory
    tentativeTitle: string
    topic: string
    topicDescription: string
}

export type TimelineStageName = '발단' | '전개' | '파생' | '진정'

export interface TimelineSummaryRow {
    issue_id: string
    stage: string
    stage_title: string
    summary: string
    date_start: string
    date_end: string
    generated_at: string
}

export function samplePostTitles(
    posts: Array<{ title: string; source_site: string }>,
    n = 3
): string[] {
    const seen = new Set<string>()
    const sampled: string[] = []

    for (const post of posts) {
        if (sampled.length >= n) break
        if (!seen.has(post.source_site)) {
            seen.add(post.source_site)
            sampled.push(post.title)
        }
    }

    for (const post of posts) {
        if (sampled.length >= n) break
        if (!sampled.includes(post.title)) sampled.push(post.title)
    }

    return sampled
}

export async function cleanupOrphanedRecords(issueId: string): Promise<void> {
    await Promise.all([
        supabaseAdmin.from('community_data').update({ issue_id: null }).eq('issue_id', issueId),
        supabaseAdmin.from('news_data').update({ issue_id: null }).eq('issue_id', issueId),
    ])
}

export async function verifyIssueByAI(
    keyword: string,
    postCount: number,
    sourceSites: string[],
    sampleTitles: string[]
): Promise<AIVerificationResult> {
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '이슈 검증' })) {
        throw new AllKeysRateLimitedError()
    }

    try {
        const sourceSitesText = sourceSites.join(', ')
        const sampleTitlesText = sampleTitles.map((t, i) => `  ${i + 1}. "${t}"`).join('\n')

        const prompt = `커뮤니티에서 급증한 키워드가 뉴스 이슈가 될 만한지 판단하고, 카테고리, 임시 제목, 검색 키워드를 생성하세요.

키워드: "${keyword}"
급증 정보:
- 게시글 수: ${postCount}건
- 출처: ${sourceSitesText}
- 게시글 제목 샘플:
${sampleTitlesText}

## 1단계: 키워드 맥락 파악
- 키워드의 정확한 의미 파악
- 줄임말이면 원래 표현 추론 (예: "왕사남" → "왕과 사는 남자")
- 고유명사인지, 일반 단어인지 구분

## 2단계: 이슈 판단
- ✅ 이슈: 사회적 논란, 연예 뉴스, 정치 이슈, 스포츠 경기, 사건사고, 화제작
- ❌ 이슈 아님: 단순 유행어/밈, 스팸/홍보, 의미 없는 반응글, 일상 대화

## 3단계: 카테고리 분류 (정확히 판단)
다음 중 하나 선택:
- "사회": 사건사고, 법원 판결, 복지, 교육, 사회 이슈, 생활, 여행, 음식, 건강
- "정치": 정치인, 정부 정책, 국회, 선거, 외교
- "연예": 연예인, 아이돌, 드라마, 영화, 음악, 방송
- "스포츠": 스포츠 경기, 선수, 대회, 올림픽, 월드컵
- "경제": 기업, 주식, 부동산, 금융, 경제 정책
- "기술": IT, 과학, 게임, AI, 스타트업, 반도체, 연구
- "세계": 국제 뉴스, 외국 사건, 해외 이슈

⚠️ 카테고리 판단 우선순위:
1. 스포츠 관련 (경기, 선수) → "스포츠"
2. 기업 비즈니스 관련 → "경제"
3. 연예인/드라마/영화 → "연예"
4. 사건사고/법원/교육/생활/문화 → "사회"
5. 국내 정치인/국내 정책/국회 → "정치"
6. IT/과학/기술/연구 → "기술"
7. 해외에서 발생한 사건·분쟁·외교·외국 정치 → "세계"
8. 불명확하면 → "사회"

## 4단계: 실제 행위자(주인공) 파악 후 임시 제목 생성
커뮤니티 글에 여러 인물이 등장할 때, 반드시 실제 사건의 행위자(agent)를 파악하세요.
- "A가 B의 기록을 넘었다/뺏었다" → 주인공은 A (행위자), B는 배경
- "A가 B를 이겼다/제쳤다" → 주인공은 A
- 커뮤니티 키워드가 B이더라도, 실제 사건이 A에 관한 것이면 제목의 주인공은 A
- 예: 키워드 "호날두", 글 "메시가 호날두 해트트릭 기록 뺏어" → 주인공은 메시
임시 이슈 제목 (8~15자), 금지: "~논란", "~화제", "~충격" 같은 모호한 표현
사실적 표현 사용 (예: "WBC 한국 경기", "최태원 이혼 소송")

## 5단계: 검색 키워드 생성 (중요!)
뉴스 매칭률을 최대화하는 키워드 — 반드시 4단계에서 파악한 실제 행위자 기준으로 생성
- 줄임말은 원래 표현으로 풀어서 사용
- 영화/드라마: 정식 제목 사용
- 인물: 풀네임 사용
- 예: 주인공이 메시이면 "메시 월드컵 해트트릭" (커뮤니티 키워드 "호날두" 아님)

## 6단계: 주제 및 주제 설명 생성
주제 (5~10자): 핵심 고유명사 포함 (예: "옥택연 결혼", "민희진 뉴진스 분쟁")
주제 설명 (2~3줄, 60~100자): 구체적 사실 중심

응답 형식 (JSON만):
{
  "isIssue": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)",
  "category": "연예",
  "tentativeTitle": "임시 이슈 제목",
  "searchKeyword": "네이버 뉴스 검색용 키워드",
  "topic": "옥택연 결혼",
  "topicDescription": "배우 옥택연이 10년 사귄 연인과 4월 24일 결혼한다."
}`

        const content = await callClaude(
            [{ role: 'user', content: prompt }],
            { model: 'claude-sonnet-4-6', temperature: 0.2, max_tokens: 500, jsonMode: true }
        )

        recordRateLimitSuccess()

        const result = parseJsonObject<AIVerificationResult>(content)
        if (!result) {
            return {
                isIssue: false, confidence: 0, reason: 'JSON 파싱 실패',
                searchKeyword: '', category: '사회', tentativeTitle: '', topic: '', topicDescription: ''
            }
        }

        if (typeof result.confidence !== 'number' || !result.reason) {
            return {
                isIssue: false, confidence: 0, reason: 'AI 응답 불완전',
                searchKeyword: '', category: '사회', tentativeTitle: '', topic: '', topicDescription: ''
            }
        }

        const validCategories: IssueCategory[] = ['사회', '정치', '연예', '스포츠', '경제', '기술', '세계']
        const category = validCategories.includes(result.category) ? result.category : '사회'

        return {
            isIssue: result.isIssue && result.confidence >= 70,
            confidence: result.confidence,
            reason: result.reason,
            searchKeyword: result.searchKeyword || keyword,
            category,
            tentativeTitle: result.tentativeTitle || keyword,
            topic: result.topic || keyword,
            topicDescription: result.topicDescription || '',
        }

    } catch (error) {
        if (error instanceof Error && error.message.includes('Rate Limit')) {
            recordRateLimitFailure()
        }
        return {
            isIssue: false, confidence: 0, reason: `에러: ${error}`,
            searchKeyword: '', category: '사회', tentativeTitle: '', topic: '', topicDescription: ''
        }
    }
}

export async function filterAndTitleByAI(
    keyword: string,
    tentativeTitle: string,
    newsItems: Array<{ id: string; title: string; link: string; source: string; published_at: string }>,
    communityPosts: Array<{ id: string; title: string; source_site: string; created_at: string }>,
    mode: 'new' | 'followup' = 'new'
): Promise<{
    finalIssueTitle: string
    relevantNewsIds: string[]
    relevantCommunityIds: string[]
}> {
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '필터링+제목' })) {
        throw new AllKeysRateLimitedError()
    }

    const newsTitlesText = newsItems.slice(0, 20).map((n, i) => `뉴스${i + 1}. ${n.title}`).join('\n')
    const postTitlesText = communityPosts.slice(0, 20).map((p, i) => `커뮤니티${i + 1}. ${p.title}`).join('\n')

    const newsFilterGuide = mode === 'followup'
        ? `## 작업 1: 관련 뉴스 선별 (후속 보도 기준)
이 뉴스들은 기존 이슈의 후속·진행·결과 보도일 수 있습니다.
같은 인물·사건의 다음 단계(예고→실행, 표명→제출, 논란→결과) 뉴스는 포함.
완전히 다른 사건·인물을 다룬 뉴스만 제외.`
        : `## 작업 1: 관련 뉴스 선별 (엄격하게 판단)
이슈 제목의 핵심 주제를 직접 다룬 뉴스만 선택.
같은 카테고리·같은 인물이라도 다른 사건/주제면 반드시 제외.
불확실하면 반드시 제외.`

    const communityFilterGuide = mode === 'followup'
        ? `## 작업 3: 관련 커뮤니티 글 선별 (후속 보도 기준)
같은 인물·사건을 언급하는 글은 포함. 완전히 다른 주제면 제외.`
        : `## 작업 3: 관련 커뮤니티 글 선별 (엄격하게 판단)
이슈 제목의 핵심 사건과 직접 관련된 글만 선택. 불확실하면 제외.`

    const prompt = `아래 이슈 제목과 관련된 뉴스/커뮤니티 글을 선별하고, 최종 이슈 제목을 생성하세요.

이슈 제목: "${tentativeTitle}"

[뉴스 목록] (${newsItems.length}건):
${newsTitlesText}

[커뮤니티 글 목록] (${communityPosts.length}건):
${postTitlesText}

${newsFilterGuide}

## 작업 2: 최종 이슈 제목 생성
선별된 뉴스 제목들의 공통 핵심 내용으로 이슈 제목 작성
- 8~15자, 사실 중심, 구체적 표현
- 금지: "화제", "논란", "충격", "대박"
- 선별된 뉴스가 0건이면 finalIssueTitle은 이슈 제목 그대로 유지
⚠️ 내용 교정 필수: 선별된 뉴스 대부분의 실제 내용이 이슈 제목과 다르면 반드시 뉴스 기준으로 수정하세요.
- 주인공(행위자)이 다를 때: 이슈 제목 "호날두 해트트릭 기록", 뉴스 대부분 "메시 해트트릭" → "메시 월드컵 해트트릭"
- 이벤트 유형이 다를 때: 이슈 제목 "한국 멕시코 친선경기", 뉴스 대부분 "월드컵 한국-멕시코전" → "한국 멕시코 월드컵 경기"

${communityFilterGuide}

응답 형식 (JSON만):
{
  "finalIssueTitle": "최종 이슈 제목",
  "relevantNewsNumbers": [1, 3, 5],
  "relevantCommunityNumbers": [1, 2, 4, 7]
}

※ 뉴스 번호와 커뮤니티 번호는 각각 1부터 시작하는 별도 번호`

    const MAX_ATTEMPTS = 2

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const content = await callGroq(
                [{ role: 'user', content: prompt }],
                { model: 'qwen/qwen3.6-27b', temperature: 0.2, max_tokens: 500, jsonMode: true }
            )

            recordRateLimitSuccess()

            const result = parseJsonObject<{
                finalIssueTitle: string
                relevantNewsNumbers: number[]
                relevantCommunityNumbers: number[]
            }>(content)

            if (!result) {
                if (attempt < MAX_ATTEMPTS) continue
                return { finalIssueTitle: tentativeTitle, relevantNewsIds: [], relevantCommunityIds: [] }
            }

            const relevantNewsIds = (result.relevantNewsNumbers || [])
                .filter(n => n >= 1 && n <= newsItems.length)
                .map(n => newsItems[n - 1].id)

            const relevantCommunityIds = (result.relevantCommunityNumbers || [])
                .filter(n => n >= 1 && n <= communityPosts.length)
                .map(n => communityPosts[n - 1].id)

            return {
                finalIssueTitle: result.finalIssueTitle || tentativeTitle,
                relevantNewsIds,
                relevantCommunityIds,
            }

        } catch (error) {
            const isRateLimit = error instanceof Error && error.message.includes('Rate Limit')
            if (isRateLimit) recordRateLimitFailure()

            if (isRateLimit || attempt >= MAX_ATTEMPTS) {
                return { finalIssueTitle: tentativeTitle, relevantNewsIds: [], relevantCommunityIds: [] }
            }
        }
    }

    return { finalIssueTitle: tentativeTitle, relevantNewsIds: [], relevantCommunityIds: [] }
}

export async function classifyAndSummarizeTimeline(
    issueTitle: string,
    news: Array<{ id: string; title: string; published_at: string; link: string }>,
    issueStatus: string,
): Promise<{
    stageMap: Map<string, TimelineStageName>
    pointSummaries: Map<string, string>
    summaryRows: Omit<TimelineSummaryRow, 'issue_id'>[]
    briefSummary: { intro: string; bullets: string[]; conclusion: string } | null
}> {
    const stageMap = new Map<string, TimelineStageName>()
    const pointSummaries = new Map<string, string>()

    if (news.length === 0) return { stageMap, pointSummaries, summaryRows: [], briefSummary: null }

    // 뉴스 1건이어도 brief_summary(3줄 요약)는 항상 생성 시도 — AI가 '발단'으로만 분류하고 브리핑을 만든다
    const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }
    const newsListText = news.map((n, i) =>
        `${i + 1}. [${n.published_at.slice(0, 10)}] ${n.title}`
    ).join('\n')

    const prompt = `다음은 한국 이슈 "${issueTitle}"와 관련된 뉴스 목록입니다 (시간순).

${newsListText}

## 작업 1: 각 뉴스를 단계로 분류
- 발단: 이슈가 처음 불거진 계기 (핵심 뉴스 1개, 보통 가장 오래된 것)
- 전개: 이슈의 직접적인 발전 (입장 발표, 후속 조치 등)
- 파생: 이슈로 인해 새로 불거진 별개 논란
- 진정: 이슈가 마무리되는 흐름${issueStatus === '종결' ? ' (종결 이슈이므로 마지막 뉴스에 배정)' : ' (현재 진행 중이므로 사용 안 함)'}

## 작업 2: 각 뉴스를 "타이틀: 설명" 형식으로 요약
- 타이틀은 3~5단어, 설명은 2~3문장

## 작업 3: 단계별 요약 생성
stageTitle은 10자 이내, summary는 기사 수에 맞는 분량

## 작업 4: 브리핑 요약
- intro: 이슈 현황 한 문장
- bullets: 핵심 팩트 3~5개
- conclusion: 한 줄 결론 (👉 로 시작)
- threeLine: intro·bullets·conclusion 전체 내용을 종합해서 "상황 → 전개 → 현재 상태" 3줄로 다시 압축. 세 줄이 서로 겹치는 내용을 반복하지 않도록 각 줄에 다른 정보를 담을 것 (예: 첫 줄에 쓴 내용을 둘째 줄에서 다시 말하지 않기). 각 줄은 "~했어요", "~하고 있어요"처럼 친근한 해요체로 작성하고, "~습니다" 같은 하십시오체나 "~야", "~해" 같은 반말은 쓰지 말 것

반드시 아래 JSON 형식으로만 답하세요:
{
  "classifications": [{"index":1,"stage":"발단"},{"index":2,"stage":"전개"}],
  "pointSummaries": [{"index":1,"pointSummary":"타이틀: 설명"}],
  "summaries": [{"stage":"발단","stageTitle":"제목","summary":"요약문"}],
  "brief": {"intro":"한 문장 현황","bullets":["팩트1","팩트2"],"conclusion":"👉 한 줄 결론","threeLine":["상황 압축 1줄이에요","전개 압축 1줄이에요","현재상태 압축 1줄이에요"]}
}`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'qwen/qwen3.6-27b', temperature: 0.1, max_tokens: 2000, jsonMode: true },
        )

        const result = parseJsonObject<{
            classifications: Array<{ index: number; stage: string }>
            pointSummaries: Array<{ index: number; pointSummary: string }>
            summaries: Array<{ stage: string; stageTitle: string; summary: string }>
            brief: { intro: string; bullets: string[]; conclusion: string; threeLine?: string[] }
        }>(content)

        if (!result) throw new Error('JSON 파싱 실패')

        result.classifications?.forEach(item => {
            const target = news[item.index - 1]
            const valid: TimelineStageName[] = ['발단', '전개', '파생', '진정']
            if (target && valid.includes(item.stage as TimelineStageName)) {
                stageMap.set(target.id, item.stage as TimelineStageName)
            }
        })

        news.forEach((n, i) => {
            if (!stageMap.has(n.id)) stageMap.set(n.id, i === 0 ? '발단' : '전개')
        })

        result.pointSummaries?.forEach(item => {
            const target = news[item.index - 1]
            if (target && item.pointSummary) pointSummaries.set(target.id, item.pointSummary)
        })

        const grouped = new Map<string, string[]>()
        for (const n of news) {
            const stage = stageMap.get(n.id) ?? '전개'
            if (!grouped.has(stage)) grouped.set(stage, [])
            grouped.get(stage)!.push(n.published_at)
        }

        const now = new Date().toISOString()
        const summaryRows: Omit<TimelineSummaryRow, 'issue_id'>[] = (result.summaries ?? [])
            .filter(s => grouped.has(s.stage))
            .sort((a, b) => (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9))
            .map(s => {
                const dates = grouped.get(s.stage)!.sort()
                return {
                    stage: s.stage,
                    stage_title: s.stageTitle ?? s.stage,
                    summary: s.summary ?? '',
                    date_start: dates[0],
                    date_end: dates[dates.length - 1],
                    generated_at: now,
                }
            })

        return { stageMap, pointSummaries, summaryRows, briefSummary: result.brief ?? null }

    } catch (err) {
        console.warn('  ⚠️ [타임라인 분류+요약 실패] fallback:', err)
        news.forEach((n, i) => stageMap.set(n.id, i === 0 ? '발단' : '전개'))
        return { stageMap, pointSummaries, summaryRows: [], briefSummary: null }
    }
}
