/**
 * app/api/admin/migrations/reclassify-timeline/route.ts
 *
 * [타임라인 단계 재분류 마이그레이션]
 *
 * 기존 이슈의 timeline_points를 새 분류 로직으로 업데이트합니다.
 *
 * 작업 내용:
 * 1. '진정' stage → '전개'로 변경 (UI에서 이슈 종결 별도 표시로 대체)
 * 2. 중간 포인트들 → Groq으로 전개/파생 재분류
 *
 * 사용법:
 *   POST /api/admin/migrations/reclassify-timeline
 *   { "dryRun": true }  → 실제 변경 없이 예상 결과만 확인
 *   { "dryRun": false } → 실제 변경 실행
 *
 * rate limit 고려: 이슈당 Groq 1회, 중간 포인트 3개 이하면 스킵
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonArray } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAdminRequest(request: NextRequest): boolean {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) ?? []
    const authHeader = request.headers.get('x-admin-email')
    return adminEmails.length > 0 && authHeader !== null && adminEmails.includes(authHeader)
}

async function reclassifyMiddlePoints(
    issueTitle: string,
    middlePoints: Array<{ id: string; title: string | null }>,
): Promise<Map<string, '전개' | '파생'>> {
    const result = new Map<string, '전개' | '파생'>()

    if (middlePoints.length === 0) return result
    if (middlePoints.length <= 2) {
        middlePoints.forEach(p => result.set(p.id, '전개'))
        return result
    }

    try {
        const listText = middlePoints.map((p, i) => `${i + 1}. ${p.title ?? ''}`).join('\n')
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
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 300 },
        )

        const parsed = parseJsonArray<{ index: number; stage: string }>(content)
        if (parsed) {
            parsed.forEach(item => {
                const target = middlePoints[item.index - 1]
                if (target && (item.stage === '전개' || item.stage === '파생')) {
                    result.set(target.id, item.stage)
                }
            })
        }
    } catch {
        // fallback: 전부 전개
    }

    middlePoints.forEach(p => { if (!result.has(p.id)) result.set(p.id, '전개') })
    return result
}

export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false // 기본값 true (안전)

    try {
        console.log(`[reclassify-timeline] 시작 (dryRun: ${dryRun})`)

        // 1. '진정' stage 포인트 전부 '전개'로 변경
        const { data: calmingPoints, count: calmingCount } = await supabaseAdmin
            .from('timeline_points')
            .select('id', { count: 'exact' })
            .eq('stage', '진정')

        console.log(`  • '진정' 포인트: ${calmingCount ?? 0}건`)

        if (!dryRun && calmingPoints && calmingPoints.length > 0) {
            const ids = calmingPoints.map(p => p.id)
            await supabaseAdmin
                .from('timeline_points')
                .update({ stage: '전개' })
                .in('id', ids)
            console.log(`  ✓ '진정' → '전개' 변경 완료: ${ids.length}건`)
        }

        // 2. 이슈별 중간 포인트 Groq 재분류
        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .not('approval_status', 'is', null)
            .order('created_at', { ascending: false })
            .limit(200)

        if (!issues || issues.length === 0) {
            return NextResponse.json({ success: true, message: '처리할 이슈 없음', dryRun })
        }

        console.log(`  • 대상 이슈: ${issues.length}건`)

        let reclassifiedIssues = 0
        let skippedIssues = 0
        let parigingCount = 0 // 파생으로 분류된 수

        for (const issue of issues) {
            const { data: points } = await supabaseAdmin
                .from('timeline_points')
                .select('id, title, stage, occurred_at')
                .eq('issue_id', issue.id)
                .order('occurred_at', { ascending: true })

            if (!points || points.length < 3) {
                skippedIssues++
                continue // 중간 포인트 없으면 스킵
            }

            // 첫 번째(발단), 마지막 제외한 중간만 추출
            const middlePoints = points.slice(1, -1)
            if (middlePoints.length === 0) {
                skippedIssues++
                continue
            }

            const stageMap = await reclassifyMiddlePoints(
                issue.title,
                middlePoints.map(p => ({ id: p.id, title: p.title })),
            )

            if (!dryRun) {
                for (const [id, stage] of stageMap.entries()) {
                    await supabaseAdmin
                        .from('timeline_points')
                        .update({ stage })
                        .eq('id', id)
                }
            }

            const derivedCount = [...stageMap.values()].filter(s => s === '파생').length
            parigingCount += derivedCount
            reclassifiedIssues++

            // Groq rate limit 방지
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        console.log(`[reclassify-timeline] 완료`)

        return NextResponse.json({
            success: true,
            dryRun,
            calmingPointsUpdated: dryRun ? 0 : (calmingCount ?? 0),
            reclassifiedIssues,
            skippedIssues,
            parigingCount,
            message: dryRun
                ? `dryRun 완료 — 실제 변경하려면 { "dryRun": false }로 재요청`
                : '재분류 완료',
        })
    } catch (error) {
        console.error('[reclassify-timeline] 에러:', error)
        return NextResponse.json(
            { error: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        )
    }
}
