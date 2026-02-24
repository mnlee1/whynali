/**
 * app/api/cron/recalculate-heat/route.ts
 *
 * [화력 분석 + 이슈 상태 자동 전환 Cron]
 *
 * 승인·대기 이슈의 화력 지수를 재계산하고, 두 가지 자동 전환을 수행합니다.
 * Vercel Cron으로 10분마다 실행됩니다.
 *
 * 1) approval_status 전환 (대기 이슈만):
 *   - heat_index >= AUTO_APPROVE_THRESHOLD → 승인
 *   - heat_index <  MIN_HEAT_TO_REGISTER  → 반려
 *
 * 2) status 전환 (승인 이슈만, 08_이슈상태전환_규격.md §3):
 *   - 점화 → 논란중: 승인 후 N시간 + heat_index >= M
 *   - 점화 → 종결:   승인 후 N시간 + heat_index < K (바이패스)
 *   - 논란중 → 종결: 화력 소진 OR 신규 수집 없음
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { recalculateHeatForIssue } from '@/lib/analysis/heat'
import { evaluateStatusTransition } from '@/lib/analysis/status-transition'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* issue-candidate.ts와 동일한 환경변수 참조 */
const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '10')
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()

        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, status, approved_at, created_at')
            .in('approval_status', ['승인', '대기'])
            .order('updated_at', { ascending: false })
            .limit(100)

        if (!issues || issues.length === 0) {
            return NextResponse.json({
                success: true,
                message: '처리할 이슈가 없습니다',
                processed: 0,
            })
        }

        const results: Array<{
            issueId: string
            issueTitle: string
            heatIndex: number
            statusChanged?: string
        }> = []

        let autoApproved = 0
        let autoRejected = 0
        let statusTransitioned = 0

        for (const issue of issues) {
            try {
                const heatIndex = await recalculateHeatForIssue(issue.id)
                const result: (typeof results)[number] = {
                    issueId: issue.id,
                    issueTitle: issue.title,
                    heatIndex,
                }

                /*
                 * 대기 이슈: approval_status 자동 전환.
                 * 승인된 이슈는 화력 하락으로 반려 처리하지 않는다.
                 */
                if (issue.approval_status === '대기') {
                    if (heatIndex >= AUTO_APPROVE_THRESHOLD) {
                        await supabaseAdmin
                            .from('issues')
                            .update({
                                approval_status: '승인',
                                approved_at: new Date().toISOString(),
                            })
                            .eq('id', issue.id)
                        result.statusChanged = '대기 → 승인'
                        autoApproved++
                    } else if (heatIndex < MIN_HEAT_TO_REGISTER) {
                        await supabaseAdmin
                            .from('issues')
                            .update({ approval_status: '반려' })
                            .eq('id', issue.id)
                        result.statusChanged = '대기 → 반려'
                        autoRejected++
                    }
                }

                /*
                 * 승인 이슈: status(점화/논란중/종결) 자동 전환.
                 * 08_이슈상태전환_규격.md §3 기준으로 평가.
                 */
                if (issue.approval_status === '승인' && issue.status) {
                    const transition = await evaluateStatusTransition({
                        id: issue.id,
                        status: issue.status,
                        approved_at: issue.approved_at ?? null,
                        created_at: issue.created_at,
                        heat_index: heatIndex,
                    })

                    if (transition.newStatus) {
                        await supabaseAdmin
                            .from('issues')
                            .update({
                                status: transition.newStatus,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', issue.id)
                        result.statusChanged = (result.statusChanged ? result.statusChanged + ', ' : '')
                            + `${issue.status} → ${transition.newStatus} (${transition.reason})`
                        statusTransitioned++
                    }
                }

                results.push(result)
            } catch (err) {
                console.error(`이슈 ${issue.id} 화력 계산 실패:`, err)
            }
        }

        const elapsed = Date.now() - startTime
        const avgHeat =
            results.reduce((sum, r) => sum + r.heatIndex, 0) / (results.length || 1)

        return NextResponse.json({
            success: true,
            processed: results.length,
            autoApproved,
            autoRejected,
            statusTransitioned,
            avgHeat: avgHeat.toFixed(2),
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
            details: results.slice(0, 10),
        })
    } catch (error) {
        console.error('화력 분석 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'HEAT_RECALCULATION_ERROR',
                message: '화력 분석 실패',
            },
            { status: 500 }
        )
    }
}
