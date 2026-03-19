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
 *   - 자동 반려 없음 (2026-03-16 제거): 화력 하락해도 대기 유지, 관리자가 직접 판단
 *
 * 2) status 전환 (승인·대기 이슈, 08_이슈상태전환_규격.md §3):
 *   - 점화 → 논란중: 승인 후 N시간 + heat_index >= M + 커뮤니티 1건
 *   - 점화 → 종결:   승인 후 N시간 + heat_index < K (바이패스)
 *   - 논란중 → 종결: 화력 소진 OR 신규 수집 없음
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { recalculateHeatForIssue, calculateRecentHeat } from '@/lib/analysis/heat'
import { evaluateStatusTransition } from '@/lib/analysis/status-transition'
import { verifyCronRequest } from '@/lib/cron-auth'
import { closeVotesOnIssueClosed } from '@/lib/vote-auto-closer'
import { closeDiscussionsOnIssueClosed } from '@/lib/discussion-auto-closer'
import { type IssueCategory } from '@/lib/config/categories'
import {
    CANDIDATE_AUTO_APPROVE_THRESHOLD as AUTO_APPROVE_THRESHOLD,
    CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT_TO_REGISTER,
    AUTO_APPROVE_CATEGORIES,
} from '@/lib/config/candidate-thresholds'
import { createShortformJobInBackground } from '@/lib/shortform/background-trigger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * shouldAutoApprove - 자동 승인 조건 판단
 * 
 * 화력이 임계값 이상이고 허용된 카테고리인지 확인합니다.
 * 
 * @param category 이슈 카테고리
 * @param heatIndex 화력 지수
 * @returns 자동 승인 가능 여부
 */
function shouldAutoApprove(category: IssueCategory, heatIndex: number): boolean {
    return heatIndex >= AUTO_APPROVE_THRESHOLD && AUTO_APPROVE_CATEGORIES.includes(category)
}

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const MAX_EXECUTION_TIME = 100000 // 100초 (120초 타임아웃 전에 여유있게 종료)

        // 우선순위 기반 이슈 조회:
        // 1) 점화 상태 이슈 (상태 전환이 시급함)
        // 2) 논란중 상태 이슈 (종결 전환 확인 필요)
        // 3) 최근 업데이트된 대기/승인 이슈
        const [igniteIssues, debateIssues, recentIssues] = await Promise.all([
            // 점화 상태 이슈 (최대 30개)
            supabaseAdmin
                .from('issues')
                .select('id, title, category, approval_status, status, approved_at, created_at, updated_at')
                .eq('status', '점화')
                .in('approval_status', ['승인', '대기'])
                .order('approved_at', { ascending: true, nullsFirst: false })
                .limit(30),

            // 논란중 상태 이슈 (최대 15개)
            supabaseAdmin
                .from('issues')
                .select('id, title, category, approval_status, status, approved_at, created_at, updated_at')
                .eq('status', '논란중')
                .in('approval_status', ['승인', '대기'])
                .order('updated_at', { ascending: true })
                .limit(15),

            // 최근 업데이트된 이슈 (최대 15개, 점화/논란중 제외)
            supabaseAdmin
                .from('issues')
                .select('id, title, category, approval_status, status, approved_at, created_at, updated_at')
                .in('approval_status', ['승인', '대기'])
                .not('status', 'in', '(점화,논란중)')
                .order('updated_at', { ascending: false })
                .limit(15),
        ])

        // 중복 제거하며 병합 (점화 > 논란중 > 최근 순서)
        const issueMap = new Map<string, any>()
        
        ;[...(igniteIssues.data ?? []), ...(debateIssues.data ?? []), ...(recentIssues.data ?? [])]
            .forEach(issue => {
                if (!issueMap.has(issue.id)) {
                    issueMap.set(issue.id, issue)
                }
            })

        const issues = Array.from(issueMap.values())

        if (issues.length === 0) {
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
                        // UI 표시용 시간 가중 화력 계산
                        const heatIndex = await recalculateHeatForIssue(issue.id)
                        
                        const result: (typeof results)[number] = {
                            issueId: issue.id,
                            issueTitle: issue.title,
                            heatIndex,
                        }

                        /*
                         * 대기 이슈: approval_status 자동 전환.
                         * 승인된 이슈는 화력 하락으로 반려 처리하지 않는다.
                         * 반려 시에도 approved_at을 설정하여 상태 전환 로직이 정상 작동하도록 함.
                         * 
                         * 자동 승인 조건:
                         * 1. 화력 30점 이상
                         * 2. 카테고리가 사회/기술/스포츠 중 하나
                         * 
                         * 자동 반려 유예 기간 (2026-03-13):
                         * - 이슈 생성 후 10분 이내는 자동 반려 보류
                         * - Race Condition 방지: 뉴스 연결 완료 대기
                         */
                        if (issue.approval_status === '대기') {
                            const category = issue.category as IssueCategory
                            
                            // 생성 후 10분 이내 이슈는 자동 반려 보류 (뉴스 연결 완료 대기)
                            const ageMinutes = (Date.now() - new Date(issue.created_at).getTime()) / 60000
                            const isNewIssue = ageMinutes < 10
                            
                            // 자동 승인: 화력 + 카테고리 모두 체크
                            if (shouldAutoApprove(category, heatIndex)) {
                                await supabaseAdmin
                                    .from('issues')
                                    .update({
                                        approval_status: '승인',
                                        approval_type: 'auto',
                                        approval_heat_index: heatIndex,
                                        approved_at: new Date().toISOString(),
                                    })
                                    .eq('id', issue.id)
                                result.statusChanged = '대기 → 승인 (화력 ' + heatIndex + '점, ' + category + ')'
                                return { ...result, autoApproved: 1, autoRejected: 0, statusTransitioned: 0 }
                            }
                            // 자동 반려 제거 (2026-03-16):
                            // - 화력이 15점 미만으로 떨어져도 자동 반려하지 않음
                            // - 이미 등록된 이슈는 관리자가 직접 판단
                            // - 화력 15-29점 → 대기 유지 (관리자 승인 필요)
                        }

                        /*
                         * status(점화/논란중/종결) 자동 전환.
                         * 08_이슈상태전환_규격.md §3 기준으로 평가.
                         * approval_status와 무관하게 모든 이슈의 status를 전환한다.
                         * 
                         * 상태 전환 판단은 최근 7일 화력 기준으로 수행:
                         *   - UI 표시용 화력(heatIndex): 시간 가중 화력 (실시간성)
                         *   - 상태 전환용 화력(recentHeat): 최근 7일 화력 (안정성)
                         */
                        if (issue.status) {
                            // 상태 전환용 최근 화력 계산 (최근 7일)
                            const recentHeat = await calculateRecentHeat(issue.id, 7)
                            
                            const transition = await evaluateStatusTransition({
                                id: issue.id,
                                status: issue.status,
                                approved_at: issue.approved_at ?? null,
                                created_at: issue.created_at,
                                heat_index: recentHeat,  // 상태 전환은 최근 화력 기준
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
                                
                                // 이슈가 '종결' 상태로 전환되면 관련 투표/토론 자동 마감
                                if (transition.newStatus === '종결') {
                                    const { count: voteCount } = await closeVotesOnIssueClosed(issue.id)
                                    if (voteCount > 0) {
                                        console.log(`[투표 자동 마감] 이슈 ${issue.id} 종결 → ${voteCount}개 투표 마감`)
                                    }
                                    const { count: discussionCount } = await closeDiscussionsOnIssueClosed(issue.id)
                                    if (discussionCount > 0) {
                                        console.log(`[토론 마감 예약] 이슈 ${issue.id} 종결 → ${discussionCount}개 토론 7일 후 마감`)
                                    }
                                }
                                
                                // 숏폼 job 생성 (상태 전환 시)
                                if (process.env.SHORTFORM_ENABLED === 'true') {
                                    createShortformJobInBackground(
                                        issue.id,
                                        'status_changed',
                                        '[cron/recalculate-heat]'
                                    ).catch(() => {})
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
            priorityBreakdown: {
                ignite: igniteIssues.data?.length ?? 0,
                debate: debateIssues.data?.length ?? 0,
                recent: recentIssues.data?.length ?? 0,
            },
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
