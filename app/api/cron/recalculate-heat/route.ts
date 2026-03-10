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
 * 2) status 전환 (모든 이슈, 08_이슈상태전환_규격.md §3):
 *   - 점화 → 논란중: 승인 후 N시간 + heat_index >= M + 커뮤니티 1건
 *   - 점화 → 종결:   승인 후 N시간 + heat_index < K (바이패스)
 *   - 논란중 → 종결: 화력 소진 OR 신규 수집 없음
 *   - approval_status와 독립적으로 동작 (대기/승인/반려 모두 처리)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { recalculateHeatForIssue } from '@/lib/analysis/heat'
import { evaluateStatusTransition } from '@/lib/analysis/status-transition'
import { verifyCronRequest } from '@/lib/cron-auth'
import { closeVotesOnIssueClosed } from '@/lib/vote-auto-closer'
import {
    CANDIDATE_AUTO_APPROVE_THRESHOLD as AUTO_APPROVE_THRESHOLD,
    CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT_TO_REGISTER,
} from '@/lib/config/candidate-thresholds'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const MAX_EXECUTION_TIME = 100000 // 100초 (120초 타임아웃 전에 여유있게 종료)

        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, status, approved_at, created_at')
            .in('approval_status', ['승인', '대기', '반려'])
            .order('updated_at', { ascending: false })
            .limit(15)

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
        let timeoutReached = false

        const BATCH_SIZE = 5
        for (let i = 0; i < issues.length; i += BATCH_SIZE) {
            // 타임아웃 체크
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                console.warn(`[화력 분석] 타임아웃 임박 — ${i}/${issues.length}개 처리 후 조기 종료`)
                timeoutReached = true
                break
            }

            const batch = issues.slice(i, i + BATCH_SIZE)
            const batchResults = await Promise.all(
                batch.map(async (issue) => {
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
                                        approval_type: 'auto',
                                        approval_heat_index: heatIndex,
                                        approved_at: new Date().toISOString(),
                                    })
                                    .eq('id', issue.id)
                                result.statusChanged = '대기 → 승인'
                                return { ...result, autoApproved: 1, autoRejected: 0, statusTransitioned: 0 }
                            } else if (heatIndex < MIN_HEAT_TO_REGISTER) {
                                await supabaseAdmin
                                    .from('issues')
                                    .update({ 
                                        approval_status: '반려',
                                        approval_type: 'auto',
                                        approval_heat_index: heatIndex
                                    })
                                    .eq('id', issue.id)
                                result.statusChanged = '대기 → 반려'
                                return { ...result, autoApproved: 0, autoRejected: 1, statusTransitioned: 0 }
                            }
                        }

                        /*
                         * status(점화/논란중/종결) 자동 전환.
                         * 08_이슈상태전환_규격.md §3 기준으로 평가.
                         * approval_status와 무관하게 모든 이슈의 status를 전환한다.
                         */
                        if (issue.status) {
                            const transition = await evaluateStatusTransition({
                                id: issue.id,
                                status: issue.status,
                                approved_at: issue.approved_at ?? null,
                                created_at: issue.created_at,
                                heat_index: heatIndex,
                            })

                            if (transition.newStatus) {
                                const oldStatus = issue.status
                                await supabaseAdmin
                                    .from('issues')
                                    .update({
                                        status: transition.newStatus,
                                        updated_at: new Date().toISOString(),
                                    })
                                    .eq('id', issue.id)
                                
                                // 이슈가 '종결' 상태로 전환되면 관련 투표 자동 마감
                                if (transition.newStatus === '종결') {
                                    const { count } = await closeVotesOnIssueClosed(issue.id)
                                    if (count > 0) {
                                        console.log(`[투표 자동 마감] 이슈 ${issue.id} 종결 → ${count}개 투표 마감`)
                                    }
                                }
                                
                                result.statusChanged = (result.statusChanged ? result.statusChanged + ', ' : '')
                                    + `${oldStatus} → ${transition.newStatus} (${transition.reason.message})`
                                return { ...result, autoApproved: 0, autoRejected: 0, statusTransitioned: 1 }
                            }
                        }

                        return { ...result, autoApproved: 0, autoRejected: 0, statusTransitioned: 0 }
                    } catch (err) {
                        console.error(`이슈 ${issue.id} 화력 계산 실패:`, err)
                        return null
                    }
                })
            )

            batchResults.forEach((batchResult) => {
                if (batchResult) {
                    autoApproved += batchResult.autoApproved
                    autoRejected += batchResult.autoRejected
                    statusTransitioned += batchResult.statusTransitioned
                    const { autoApproved: _, autoRejected: __, statusTransitioned: ___, ...result } = batchResult
                    results.push(result)
                }
            })
        }

        const elapsed = Date.now() - startTime
        const avgHeat =
            results.reduce((sum, r) => sum + r.heatIndex, 0) / (results.length || 1)

        return NextResponse.json({
            success: true,
            processed: results.length,
            totalIssues: issues.length,
            autoApproved,
            autoRejected,
            statusTransitioned,
            avgHeat: avgHeat.toFixed(2),
            elapsed: `${elapsed}ms`,
            timeoutReached,
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
