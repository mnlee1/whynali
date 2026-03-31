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
import { parseJsonArray } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 이슈당 타임라인 최대 포인트 수 */
const MAX_TIMELINE_POINTS = parseInt(process.env.MAX_TIMELINE_POINTS ?? '10')
/** 종결 이슈 재점화 감지 시간 창 (시간) */
const REIGNITE_WINDOW_HOURS = parseInt(process.env.STATUS_CLOSED_IDLE_HOURS ?? '48')

type TimelineStage = '발단' | '전개' | '파생' | '진정'

/**
 * classifyNewStages - 새로 추가될 뉴스의 단계를 Groq으로 분류
 *
 * 새 뉴스가 2개 이하이면 Groq 호출 없이 전개 배정.
 * Groq 실패 시 전부 전개로 fallback.
 */
async function classifyNewStages(
    issueTitle: string,
    newsItems: Array<{ id: string; title: string }>,
): Promise<Map<string, '전개' | '파생'>> {
    const result = new Map<string, '전개' | '파생'>()

    if (newsItems.length === 0) return result

    // 2개 이하: Groq 호출 없이 전개 배정
    if (newsItems.length <= 2) {
        newsItems.forEach(n => result.set(n.id, '전개'))
        return result
    }

    try {
        const listText = newsItems.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
        const prompt = `다음은 한국 이슈와 관련 기사 목록입니다.

이슈 제목: ${issueTitle}

아래 기사들을 각각 "전개" 또는 "파생"으로 분류해주세요.
- 전개: 이슈의 직접적인 발전 (입장 발표, 후속 조치, 사건 확대 등)
- 파생: 이슈로 인해 새로 불거진 별개의 논란 (새 인물 등장, 연관 사건 등)

기사 목록:
${listText}

반드시 아래 JSON 형식으로만 답하세요:
[{"index":1,"stage":"전개"},{"index":2,"stage":"파생"}]`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 300 },
        )

        const parsed = parseJsonArray<{ index: number; stage: string }>(content)
        if (parsed) {
            parsed.forEach(item => {
                const target = newsItems[item.index - 1]
                if (target && (item.stage === '전개' || item.stage === '파생')) {
                    result.set(target.id, item.stage)
                }
            })
        }
    } catch (error) {
        console.warn('  ⚠️ [단계 분류 실패] 전개로 fallback:', error)
    }

    // 분류 누락 → 전개 fallback
    newsItems.forEach(n => { if (!result.has(n.id)) result.set(n.id, '전개') })

    return result
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

            // 2. 현재 타임라인 포인트 조회 (source_url 중복 방지용)
            const { data: existingPoints } = await supabaseAdmin
                .from('timeline_points')
                .select('source_url, stage')
                .eq('issue_id', issue.id)
                .order('occurred_at', { ascending: true })

            const existingCount = existingPoints?.length ?? 0

            // 최대 포인트 수 도달 시 스킵
            if (existingCount >= MAX_TIMELINE_POINTS) {
                skippedCount++
                continue
            }

            const existingUrls = new Set(
                (existingPoints ?? []).map(p => p.source_url).filter(Boolean)
            )

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

            // 4. 타임라인에 없는 새 뉴스만 필터링
            const newNews = newsData.filter(n => n.link && !existingUrls.has(n.link))

            if (newNews.length === 0) {
                skippedCount++
                continue
            }

            // 추가 후 총 포인트가 MAX를 초과하지 않도록 제한
            const allowedCount = MAX_TIMELINE_POINTS - existingCount
            const newsToAdd = newNews.slice(0, allowedCount)

            console.log(`  [${issue.title}] 새 뉴스 ${newNews.length}건 → ${newsToAdd.length}건 추가 예정`)

            // 5. Groq으로 전개/파생 분류
            const stageMap = await classifyNewStages(
                issue.title,
                newsToAdd.map(n => ({ id: n.id, title: n.title ?? '' })),
            )

            // 6. 새 포인트 생성 (전개/파생만 — '진정'은 recalculate-heat 종결 전환 시 배정)
            const newPoints = newsToAdd.map((news) => ({
                issue_id: issue.id,
                title: news.title ?? '',
                occurred_at: news.published_at ?? new Date().toISOString(),
                source_url: news.link ?? '',
                stage: stageMap.get(news.id) ?? '전개' as TimelineStage,
            }))

            const { error } = await supabaseAdmin
                .from('timeline_points')
                .insert(newPoints)

            if (error) {
                console.error(`  ❌ [타임라인 업데이트 실패] ${issue.title}: ${error.message}`)
            } else {
                console.log(`  ✓ [타임라인 업데이트 완료] ${issue.title}: ${newPoints.length}개 추가`)
                updatedCount++
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
