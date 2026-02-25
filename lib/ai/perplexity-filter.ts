/**
 * lib/ai/perplexity-filter.ts
 *
 * [Perplexity AI 2단계 이슈 전처리 필터]
 *
 * 수집된 뉴스·커뮤니티 제목을 2단계로 필터링하여
 * "사회적 파급력 있는 이슈" 후보만 issue_candidates 테이블에 저장한다.
 *
 * 1단계 (사전 필터 — 비용 절감):
 *   - 뉴스: 최근 COLLECTION_WINDOW_MIN(기본 10분) 내 수집, issue_id 미연결 건
 *   - 커뮤니티: view_count >= VIEW_THRESHOLD 또는 comment_count >= COMMENT_THRESHOLD
 *   - 최근 24시간 내 issue_candidates에 같은 제목이 이미 있으면 제외
 *
 * 2단계 (Perplexity API — 품질 판단):
 *   - 1단계 통과 건을 BATCH_SIZE(기본 20)씩 배치 호출
 *   - AI가 0~10점 점수화 + 5대 카테고리 자동 매핑
 *   - MIN_SCORE(기본 7) 이상인 건만 issue_candidates에 저장
 *
 * 법적 안전 원칙:
 *   - 제목·메타데이터만 입력 (본문·요약문 절대 미사용)
 *   - AI 출력은 점수·카테고리·근거(짧은 메모)만 수집
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import type { IssueCategory } from '@/types/issue'

/* ------------------------------------------------------------------ */
/* 환경변수 기반 임계값 (운영 중 조정 가능)                               */
/* ------------------------------------------------------------------ */
/** 뉴스 수집 건 집계 창 (분 단위). 기본 10분 */
const COLLECTION_WINDOW_MIN = parseInt(process.env.FILTER_COLLECTION_WINDOW_MIN ?? '10')
/** 커뮤니티 조회수 하한선 */
const VIEW_THRESHOLD = parseInt(process.env.FILTER_VIEW_THRESHOLD ?? '500')
/** 커뮤니티 댓글수 하한선 */
const COMMENT_THRESHOLD = parseInt(process.env.FILTER_COMMENT_THRESHOLD ?? '20')
/** Perplexity 1회 배치 최대 항목 수 */
const BATCH_SIZE = parseInt(process.env.FILTER_BATCH_SIZE ?? '20')
/** issue_candidates 저장 최소 점수 */
const MIN_SCORE = parseInt(process.env.FILTER_MIN_SCORE ?? '7')

/* ------------------------------------------------------------------ */
/* 내부 타입                                                            */
/* ------------------------------------------------------------------ */
interface FilterInput {
    id: string
    title: string
    sourceType: 'news' | 'community'
}

interface AIResult {
    id: string
    score: number
    category: IssueCategory
    reason: string
}

export interface FilterRunResult {
    /** 1단계 통과 건수 */
    stage1Passed: number
    /** AI 호출 건수 */
    aiQueried: number
    /** issue_candidates 저장 건수 */
    saved: number
    /** 오류 메시지 (있을 경우) */
    errors: string[]
}

/* ------------------------------------------------------------------ */
/* 1단계: 메타데이터 사전 필터                                           */
/* ------------------------------------------------------------------ */
/**
 * fetchStage1Candidates - 1단계 사전 필터링
 *
 * 비용이 발생하는 AI 호출 전에, 반응이 없는 저품질 건을 제거한다.
 * 최대 BATCH_SIZE * 2 건까지만 가져와 1회 실행당 API 호출을 2회로 제한한다.
 */
async function fetchStage1Candidates(): Promise<FilterInput[]> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - COLLECTION_WINDOW_MIN * 60 * 1000).toISOString()
    const dedupeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // 최근 24시간 내 이미 저장된 issue_candidates 제목 목록
    const { data: existingTitles } = await supabaseAdmin
        .from('issue_candidates')
        .select('title')
        .gte('created_at', dedupeStart)

    const existingSet = new Set((existingTitles ?? []).map((r) => r.title))

    // 뉴스: 집계 창 내 수집된 미연결 건
    const { data: newsItems } = await supabaseAdmin
        .from('news_data')
        .select('id, title')
        .is('issue_id', null)
        .gte('created_at', windowStart)
        .limit(BATCH_SIZE * 2)

    // 커뮤니티: 조회수 또는 댓글수 기준 통과 건 (최근 1시간)
    const communityWindowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const { data: communityItems } = await supabaseAdmin
        .from('community_data')
        .select('id, title, view_count, comment_count')
        .is('issue_id', null)
        .gte('created_at', communityWindowStart)
        .or(`view_count.gte.${VIEW_THRESHOLD},comment_count.gte.${COMMENT_THRESHOLD}`)
        .limit(BATCH_SIZE)

    const candidates: FilterInput[] = []

    for (const item of newsItems ?? []) {
        if (!existingSet.has(item.title)) {
            candidates.push({ id: item.id, title: item.title, sourceType: 'news' })
        }
    }

    for (const item of communityItems ?? []) {
        if (!existingSet.has(item.title)) {
            candidates.push({ id: item.id, title: item.title, sourceType: 'community' })
        }
    }

    // 중복 제목 제거 (같은 제목이 여러 건 있을 경우 첫 번째만 유지)
    const seenTitles = new Set<string>()
    return candidates.filter((c) => {
        if (seenTitles.has(c.title)) return false
        seenTitles.add(c.title)
        return true
    })
}

/* ------------------------------------------------------------------ */
/* 2단계: Perplexity API 배치 호출                                      */
/* ------------------------------------------------------------------ */
/**
 * scoreWithPerplexity - 제목 배치를 Perplexity에 넘겨 점수 + 카테고리 반환
 *
 * 법적 안전: 제목 텍스트만 전달. 본문·요약문 미사용.
 */
async function scoreWithPerplexity(items: FilterInput[]): Promise<AIResult[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY 환경변수가 설정되지 않았습니다.')

    const inputJson = JSON.stringify(
        items.map((item) => ({
            id: item.id,
            title: item.title,
            source: item.sourceType,
        }))
    )

    const prompt = `다음은 한국 뉴스·커뮤니티 제목 목록입니다.
각 항목이 한국 사회에서 "사회적 파급력이 있는 이슈"인지 평가하고 JSON 배열로만 응답하세요.

[이슈 정의]
하나의 사건·논란 단위 (예: "OO 논란", "OO 사건"). 많은 한국인이 관심을 가질 사건.

[점수 기준 0~10]
8~10: 전국민 이슈 (대형 사건·사고, 연예인 대형 논란, 주요 정치 이슈)
5~7: 특정 집단에서 화제 (스포츠 경기 결과, 커뮤니티 이슈)
0~4: 파급력 낮음 (홍보성 보도자료, 지역 소식, 단순 기사, 개인 사안)

[5대 카테고리]
연예 | 스포츠 | 정치 | 사회 | 기술

[입력]
${inputJson}

[응답 형식 — JSON 배열만, 설명 없이]
[{"id":"...","score":8,"category":"연예","reason":"대형 논란으로 사회적 관심 높음"}]`

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'sonar',
            messages: [
                {
                    role: 'system',
                    content:
                        '당신은 한국 사회 이슈 전문가입니다. ' +
                        '주어진 뉴스·커뮤니티 제목의 사회적 파급력을 평가합니다. ' +
                        '반드시 JSON 배열로만 응답하세요.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.2,  // 점수 일관성을 위해 낮게 설정
            max_tokens: 1200,
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Perplexity API 오류 (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    return parseAIResults(raw, items)
}

/**
 * parseAIResults - API 응답 JSON 파싱 + 유효성 검증
 *
 * 파싱 실패 시 빈 배열 반환 (에러를 상위로 전파하지 않음).
 */
function parseAIResults(raw: string, inputs: FilterInput[]): AIResult[] {
    const validCategories: IssueCategory[] = ['연예', '스포츠', '정치', '사회', '기술']
    const inputIds = new Set(inputs.map((i) => i.id))

    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return []

    try {
        const arr: unknown[] = JSON.parse(match[0])
        return arr
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item.id === 'string' && inputIds.has(item.id))
            .filter((item) => typeof item.score === 'number' && item.score >= 0 && item.score <= 10)
            .filter((item) => typeof item.category === 'string' && validCategories.includes(item.category as IssueCategory))
            .map((item) => ({
                id: item.id as string,
                score: Math.round(item.score as number),
                category: item.category as IssueCategory,
                reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : '',
            }))
    } catch {
        return []
    }
}

/* ------------------------------------------------------------------ */
/* 저장                                                                 */
/* ------------------------------------------------------------------ */
/**
 * saveCandidate - AI 결과를 issue_candidates 테이블에 저장
 */
async function saveCandidate(
    input: FilterInput,
    aiResult: AIResult
): Promise<void> {
    await supabaseAdmin.from('issue_candidates').insert({
        title: input.title,
        source_type: input.sourceType,
        news_ids: input.sourceType === 'news' ? [input.id] : [],
        community_ids: input.sourceType === 'community' ? [input.id] : [],
        ai_score: aiResult.score,
        ai_category: aiResult.category,
        ai_reason: aiResult.reason,
        status: 'pending',
    })
}

/* ------------------------------------------------------------------ */
/* 메인 실행 함수                                                        */
/* ------------------------------------------------------------------ */
/**
 * runPerplexityFilter - 전처리 필터 1회 실행
 *
 * Cron에서 5분마다 호출한다.
 *
 * 예시:
 * const result = await runPerplexityFilter()
 * // result.saved: issue_candidates에 저장된 건수
 */
export async function runPerplexityFilter(): Promise<FilterRunResult> {
    const result: FilterRunResult = { stage1Passed: 0, aiQueried: 0, saved: 0, errors: [] }

    // 1단계: 사전 필터
    const stage1 = await fetchStage1Candidates()
    result.stage1Passed = stage1.length

    if (stage1.length === 0) return result

    // 2단계: BATCH_SIZE씩 나눠 Perplexity 호출
    for (let i = 0; i < stage1.length; i += BATCH_SIZE) {
        const batch = stage1.slice(i, i + BATCH_SIZE)
        result.aiQueried += batch.length

        let aiResults: AIResult[] = []
        try {
            aiResults = await scoreWithPerplexity(batch)
        } catch (err) {
            result.errors.push(`배치 ${i / BATCH_SIZE + 1} AI 호출 실패: ${String(err)}`)
            continue
        }

        // MIN_SCORE 이상인 건만 저장
        const inputMap = new Map(batch.map((item) => [item.id, item]))
        for (const aiResult of aiResults) {
            if (aiResult.score < MIN_SCORE) continue

            const input = inputMap.get(aiResult.id)
            if (!input) continue

            try {
                await saveCandidate(input, aiResult)
                result.saved++
            } catch (err) {
                result.errors.push(`저장 실패 (${input.title}): ${String(err)}`)
            }
        }
    }

    return result
}
