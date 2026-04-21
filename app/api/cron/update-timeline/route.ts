/**
 * app/api/cron/update-timeline/route.ts
 *
 * [타임라인 업데이트 Cron]
 *
 * 활성 이슈에 새로 연결된 뉴스를 감지하여 타임라인에 추가합니다.
 * track-a가 정각에 실행되므로 race condition 방지를 위해 30분 오프셋으로 실행합니다.
 *
 * 흐름:
 * 1. 점화/논란중 이슈 + 최근 48시간 수집이 있는 종결 이슈 조회
 * 2. 이슈별 news_data 조회 (issue_id로 연결된 것)
 * 3. 이미 timeline_points에 있는 source_url 제외 (중복 방지)
 * 4. 새 뉴스가 있으면 Groq 배치 요청으로 전개/파생 분류
 * 5. 이슈 status='종결'이면 마지막 포인트를 '진정'으로 배정
 * 6. timeline_points에 삽입
 *
 * 스케줄: 매시 30분 (vercel.json: "30 * * * *")
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonArray, parseJsonObject } from '@/lib/ai/parse-json-response'

/**
 * generateAndCacheSummaries - 이슈 타임라인 AI 요약 생성 후 DB 저장
 * update-timeline cron에서 새 포인트 추가 후 호출
 * 유저 요청 시에는 이 캐시만 읽으므로 Groq 호출 없음
 */
async function generateAndCacheSummaries(issueId: string, issueTitle: string): Promise<void> {
    const { data: points } = await supabaseAdmin
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })

    if (!points || points.length === 0) return

    const STAGE_ORDER_MAP: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }

    const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
    for (const p of points) {
        if (!grouped.has(p.stage)) grouped.set(p.stage, [])
        grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
    }

    const stages = [...grouped.keys()].sort(
        (a, b) => (STAGE_ORDER_MAP[a] ?? 9) - (STAGE_ORDER_MAP[b] ?? 9)
    )

    const stagesText = stages.map(stage => {
        const titles = grouped.get(stage)!.map(i => `- ${i.title}`).join('\n')
        return `[${stage}]\n${titles}`
    }).join('\n\n')

    const prompt = `이슈: "${issueTitle}"

다음은 이 이슈와 관련된 뉴스 기사 제목들입니다.
각 단계는 [발단], [전개], [파생], [진정]으로 구분되어 있습니다.

${stagesText}

## 중요: 단계별 독립 요약 원칙
- **각 단계는 해당 단계의 뉴스만 사용**해서 요약하세요
- 예: [발단] 요약 시 [전개]나 [파생]의 뉴스는 절대 사용하지 마세요
- **중복된 내용의 뉴스는 하나만 선택**하세요 (예: "본격화" 제목이 3개면 1개만 사용)
- **bullets 개수는 해당 단계의 뉴스 개수를 초과하지 마세요**

## 법적 안전성 준수
- 위 기사 제목에 있는 내용만 사용하세요
- 기사 본문은 없으므로 제목에 없는 내용을 추측하지 마세요

## 요청사항
위 원칙을 엄격히 지켜 각 단계를 독립적으로 요약해주세요.

**출력 형식:**
1. 각 단계를 "발단/전개/파생/진정" 중 하나로 분류
2. 각 단계의 핵심 사건들을 bullet points로 (1~5개, 해당 단계 뉴스 개수 이하)
3. 각 bullet은 한 문장으로 간결하게
4. 제목에서 확인할 수 있는 사실만 작성
5. stageTitle에는 단계명을 붙이지 말고 내용만 작성 (예: "녹대 탈출" O, "[발단] 녹대 탈출" X)

**브리핑:**
- intro: 이슈를 한 문장으로 (예: "~가 ~해서 논란이야")
- bullets: 핵심 팩트 3~5개
- conclusion: 한 줄 결론 (예: "👉 ~한 상황이야")

JSON 응답:
{
  "summaries": [
    {"stage":"발단","stageTitle":"제목","bullets":["사건1","사건2"]},
    {"stage":"전개","stageTitle":"제목","bullets":["후속1","후속2"]}
  ],
  "brief": {"intro":"한 문장","bullets":["팩트1","팩트2"],"conclusion":"결론"}
}`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 1500 },
        )

        const parsed = parseJsonObject<{
            summaries: Array<{ stage: string; stageTitle: string; summary: string; bullets: string[] }>
            brief: { intro: string; bullets: string[]; conclusion: string }
        }>(content)
        if (!parsed) return

        // 단계별 요약 저장 (중복 제거 및 검증)
        const rows = stages.map(stage => {
            const items = grouped.get(stage)!
            const dates = items.map(i => i.occurred_at).sort()
            const ai = parsed.summaries?.find((p: { stage: string }) => p.stage === stage)
            
            let bullets = ai?.bullets ?? []
            
            // 검증 1: bullets 개수가 해당 단계 뉴스 개수를 초과하는 경우 경고
            if (bullets.length > items.length) {
                console.warn(`  ⚠️ [요약 품질 경고] ${issueTitle} - ${stage}: bullets(${bullets.length}개)가 뉴스(${items.length}개)보다 많음`)
            }
            
            // 검증 2: 중복된 bullets 제거 (완전 일치 + 유사도 높은 것)
            const uniqueBullets: string[] = []
            for (const bullet of bullets) {
                const normalized = bullet.toLowerCase().trim()
                const isDuplicate = uniqueBullets.some(existing => {
                    const existingNormalized = existing.toLowerCase().trim()
                    // 완전 일치
                    if (normalized === existingNormalized) return true
                    // 90% 이상 유사 (간단한 포함 관계 체크)
                    const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized
                    const longer = normalized.length >= existingNormalized.length ? normalized : existingNormalized
                    return longer.includes(shorter) && shorter.length / longer.length > 0.9
                })
                
                if (!isDuplicate) {
                    uniqueBullets.push(bullet)
                }
            }
            
            if (uniqueBullets.length < bullets.length) {
                console.log(`  ✓ [중복 제거] ${issueTitle} - ${stage}: ${bullets.length}개 → ${uniqueBullets.length}개`)
            }
            
            return {
                issue_id: issueId,
                stage,
                stage_title: ai?.stageTitle ?? stage,
                bullets: uniqueBullets,
                summary: uniqueBullets.join(' '), // 호환성을 위해 summary도 저장
                date_start: dates[0],
                date_end: dates[dates.length - 1],
                generated_at: new Date().toISOString(),
            }
        })

        const { error: summaryError } = await supabaseAdmin
            .from('timeline_summaries')
            .upsert(rows, { onConflict: 'issue_id,stage' })

        if (summaryError) {
            console.warn(`  ⚠️ [요약 캐시 저장 실패] ${issueTitle}: ${summaryError.message}`)
        } else {
            console.log(`  ✓ [요약 캐시 저장] ${issueTitle}: ${rows.length}개 단계`)
        }

        // 브리핑 저장
        if (parsed.brief) {
            const { error: briefError } = await supabaseAdmin
                .from('issues')
                .update({ brief_summary: parsed.brief })
                .eq('id', issueId)

            if (briefError) {
                console.warn(`  ⚠️ [브리핑 저장 실패] ${issueTitle}: ${briefError.message}`)
            } else {
                console.log(`  ✓ [브리핑 저장] ${issueTitle}`)
            }
        }
    } catch (err) {
        console.warn(`  ⚠️ [요약 생성 실패] ${issueTitle}:`, err)
    }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 이슈당 타임라인 최대 포인트 수 */
const MAX_TIMELINE_POINTS = parseInt(process.env.MAX_TIMELINE_POINTS ?? '10')
/** 종결 이슈 재점화 감지 시간 창 (시간) */
const REIGNITE_WINDOW_HOURS = parseInt(process.env.STATUS_CLOSED_IDLE_HOURS ?? '48')

type TimelineStage = '발단' | '전개' | '파생' | '진정'

// 한국어 불용어 — 조사·어미·접속사·시간 부사 등 의미 없는 단어
const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '까지', '부터', '에서', '에게', '한테', '한', '하는', '하고', '하여', '해서',
    '이다', '있다', '없다', '하다', '되다', '이고', '하며', '에도', '으로도', '이라', '라',
    '것', '수', '등', '및', '또', '그', '더', '이후', '앞서', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '내일', '어제', '해당', '기자',
])

/** 제목에서 의미 있는 키워드 추출 (2글자 이상, 불용어 제외) */
function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

/**
 * isSimilarTitle - 새 제목이 기존 제목 목록 중 하나와 유사한지 판단
 *
 * 핵심 키워드가 3개 이상 겹치면 같은 사건을 다룬 기사로 간주합니다.
 */
function isSimilarTitle(newTitle: string, existingTitles: string[]): boolean {
    const newKeywords = extractKeywords(newTitle)
    if (newKeywords.size === 0) return false

    for (const existing of existingTitles) {
        const existingKeywords = extractKeywords(existing)
        let overlap = 0
        for (const kw of newKeywords) {
            if (existingKeywords.has(kw)) overlap++
        }
        if (overlap >= 3) return true
    }
    return false
}

/**
 * classifyAndSummarizeNewPoints - 새로 추가될 뉴스의 단계 분류 + AI 요약 생성
 *
 * 새 뉴스가 2개 이하이면 Groq 호출 없이 전개 배정.
 * Groq 실패 시 전부 전개로 fallback.
 */
async function classifyAndSummarizeNewPoints(
    issueTitle: string,
    newsItems: Array<{ id: string; title: string }>,
    existingPoints: Array<{ title: string; ai_summary: string | null }>,
): Promise<{
    stageMap: Map<string, '전개' | '파생'>
    summaryMap: Map<string, string>
}> {
    const stageMap = new Map<string, '전개' | '파생'>()
    const summaryMap = new Map<string, string>()

    if (newsItems.length === 0) return { stageMap, summaryMap }

    // 2개 이하: Groq 호출 없이 전개 배정
    if (newsItems.length <= 2) {
        newsItems.forEach(n => stageMap.set(n.id, '전개'))
        return { stageMap, summaryMap }
    }

    try {
        const listText = newsItems.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
        
        // 기존 포인트들의 키워드 추출 (중복 방지 안내용)
        const existingSummaries = existingPoints
            .map(p => p.ai_summary || p.title)
            .filter(Boolean)
            .slice(0, 5) // 최근 5개만
            .map(s => `- ${s}`)
            .join('\n')

        const prompt = `다음은 한국 이슈 "${issueTitle}"와 관련된 새 기사 목록입니다.

## 새 기사 목록:
${listText}

## 기존 타임라인:
${existingSummaries || '(없음)'}

## 작업 1: 각 뉴스를 "전개" 또는 "파생"으로 분류
- 전개: 이슈의 직접적인 발전 (입장 발표, 후속 조치, 사건 확대 등)
- 파생: 이슈로 인해 새로 불거진 별개의 논란 (새 인물 등장, 연관 사건 등)
- 기존 타임라인과 중복되는 상황 변화는 제외하세요

## 작업 2: 각 뉴스 제목을 1~2문장으로 요약
- 반드시 제목에 나온 단어와 사실만 사용하세요
- 제목에 없는 내용, 배경 지식, 추측을 절대 추가하지 마세요
- 기존 타임라인과 유사한 내용은 제외
- 예시: {"index":1,"stage":"전개","pointSummary":"경찰이 드라마 촬영장 스태프 사망 사고 경위를 조사하고 있다."}

반드시 아래 JSON 형식으로만 답하세요 (중복 제외된 뉴스만):
[{"index":1,"stage":"전개","pointSummary":"설명 1~2문장"},{"index":3,"stage":"파생","pointSummary":"설명 1~2문장"}]`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 1200 },
        )

        const parsed = parseJsonArray<{ index: number; stage: string; pointSummary: string }>(content)
        if (parsed) {
            parsed.forEach(item => {
                const target = newsItems[item.index - 1]
                if (target && (item.stage === '전개' || item.stage === '파생')) {
                    stageMap.set(target.id, item.stage)
                    if (item.pointSummary) {
                        summaryMap.set(target.id, item.pointSummary)
                    }
                }
            })
        }
    } catch (error) {
        console.warn('  ⚠️ [단계 분류+요약 실패] 전개로 fallback:', error)
    }

    // 분류 누락 → 전개 fallback
    newsItems.forEach(n => { if (!stageMap.has(n.id)) stageMap.set(n.id, '전개') })

    return { stageMap, summaryMap }
}

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const MAX_EXECUTION_TIME = 250000 // 250초

        const reigniteWindowSince = new Date(
            Date.now() - REIGNITE_WINDOW_HOURS * 60 * 60 * 1000
        ).toISOString()

        // 1. 처리 대상 이슈 조회
        // - 점화/논란중: 항상 처리
        // - 종결: 최근 48시간 내 news_data가 새로 연결된 경우만 (재점화 대응)
        const [activeIssues, reigniteIssues] = await Promise.all([
            supabaseAdmin
                .from('issues')
                .select('id, title, status')
                .in('status', ['점화', '논란중'])
                .in('approval_status', ['승인', '대기'])
                .order('updated_at', { ascending: false })
                .limit(50),
            supabaseAdmin
                .from('issues')
                .select('id, title, status')
                .eq('status', '종결')
                .gte('updated_at', reigniteWindowSince)
                .order('updated_at', { ascending: false })
                .limit(20),
        ])

        const issues = [
            ...(activeIssues.data ?? []),
            ...(reigniteIssues.data ?? []),
        ]

        if (issues.length === 0) {
            return NextResponse.json({ message: '처리할 이슈 없음', updated: 0 })
        }

        console.log(`[update-timeline] 처리 대상 이슈: ${issues.length}건`)

        let updatedCount = 0
        let skippedCount = 0

        for (const issue of issues) {
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.log(`[update-timeline] 타임아웃 임박 — 중단 (처리: ${updatedCount}, 스킵: ${skippedCount})`)
                break
            }

            // 2. 현재 타임라인 포인트 조회 (URL 중복 방지 + 제목 유사도 비교용)
            const { data: existingPoints } = await supabaseAdmin
                .from('timeline_points')
                .select('source_url, stage, title, occurred_at, ai_summary')
                .eq('issue_id', issue.id)
                .order('occurred_at', { ascending: true })

            // 발단 포인트의 최초 시각 — 이 이전 뉴스는 추가하지 않음
            const baldanAt = existingPoints
                ?.filter(p => p.stage === '발단')
                .map(p => p.occurred_at)
                .sort()[0] ?? null

            const existingCount = existingPoints?.length ?? 0

            // 최대 포인트 수 도달 시 스킵
            if (existingCount >= MAX_TIMELINE_POINTS) {
                skippedCount++
                continue
            }

            const existingUrls = new Set(
                (existingPoints ?? []).map(p => p.source_url).filter(Boolean)
            )
            const existingTitles = (existingPoints ?? [])
                .map(p => p.title)
                .filter(Boolean) as string[]

            // 3. 이슈에 연결된 뉴스 조회 (시간순)
            const { data: newsData } = await supabaseAdmin
                .from('news_data')
                .select('id, title, link, published_at')
                .eq('issue_id', issue.id)
                .order('published_at', { ascending: true })

            if (!newsData || newsData.length === 0) {
                skippedCount++
                continue
            }

            // 4. URL 중복 제거 후, 제목 유사도로 동일 사건 기사 필터링
            // 발단 이전 뉴스는 추가하지 않음 (발단보다 이른 파생 방지)
            // 배치 내 중복도 방지하기 위해 추가된 제목을 누적하며 체크
            const seenTitles: string[] = [...existingTitles]
            const newNews = newsData.reduce<typeof newsData>((acc, n) => {
                if (!n.link || existingUrls.has(n.link)) return acc
                if (baldanAt && n.published_at && n.published_at < baldanAt) return acc
                if (n.title && isSimilarTitle(n.title, seenTitles)) return acc
                acc.push(n)
                if (n.title) seenTitles.push(n.title)
                return acc
            }, [])

            if (newNews.length === 0) {
                skippedCount++
                continue
            }

            // 추가 후 총 포인트가 MAX를 초과하지 않도록 제한
            const allowedCount = MAX_TIMELINE_POINTS - existingCount
            const newsToAdd = newNews.slice(0, allowedCount)

            console.log(`  [${issue.title}] 새 뉴스 ${newNews.length}건 → ${newsToAdd.length}건 추가 예정`)

            // 5. Groq으로 전개/파생 분류 + AI 요약 생성
            const { stageMap, summaryMap } = await classifyAndSummarizeNewPoints(
                issue.title,
                newsToAdd.map(n => ({ id: n.id, title: n.title ?? '' })),
                existingPoints ?? [],
            )

            // 6. 새 포인트 생성 (전개/파생만 — '진정'은 recalculate-heat 종결 전환 시 배정)
            const newPoints = newsToAdd.map((news) => ({
                issue_id: issue.id,
                title: news.title ?? '',
                occurred_at: news.published_at ?? new Date().toISOString(),
                source_url: news.link ?? '',
                stage: stageMap.get(news.id) ?? '전개' as TimelineStage,
                ai_summary: summaryMap.get(news.id) ?? null,
            }))

            const { error } = await supabaseAdmin
                .from('timeline_points')
                .insert(newPoints)

            if (error) {
                console.error(`  ❌ [타임라인 업데이트 실패] ${issue.title}: ${error.message}`)
            } else {
                console.log(`  ✓ [타임라인 업데이트 완료] ${issue.title}: ${newPoints.length}개 추가`)
                updatedCount++
                // 포인트 추가 후 즉시 요약 캐시 갱신 (유저 요청 시 Groq 호출 없음)
                await generateAndCacheSummaries(issue.id, issue.title)
            }
        }

        const elapsed = Date.now() - startTime
        console.log(`[update-timeline] 완료 — 업데이트: ${updatedCount}, 스킵: ${skippedCount}, 소요: ${elapsed}ms`)

        return NextResponse.json({
            success: true,
            updated: updatedCount,
            skipped: skippedCount,
            elapsed,
        })
    } catch (error) {
        console.error('[update-timeline] 오류:', error)
        return NextResponse.json({ error: '타임라인 업데이트 실패' }, { status: 500 })
    }
}
