/**
 * lib/analysis/status-transition.ts
 *
 * [이슈 상태 자동 전환 로직]
 *
 * 08_이슈상태전환_규격.md §3 기준에 따라 승인된 이슈의 status(점화/논란중/종결)를
 * 자동으로 전환합니다. recalculate-heat Cron에서 화력 재계산 직후 호출됩니다.
 *
 * 전환 규칙:
 *   점화 → 논란중: 승인 후 6시간 경과 + 화력 30점 이상 + 커뮤니티 1건 이상
 *   점화 → 종결: 승인 후 6시간 경과 + 화력 10점 미만 (바이패스)
 *   점화 타임아웃: 24시간 경과 + 화력 30점 미만 → 종결
 *   논란중 → 종결: 화력 10점 미만 OR 최근 48시간 신규 수집 건 없음
 *   종결 → 논란중: 재점화 감지 (급증 또는 점진적 화력 상승)
 *
 * 연동 기능:
 *   - 이슈가 '종결' 상태로 전환되면 관련 투표 자동 마감
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { closeVotesOnIssueClosed } from '@/lib/vote-auto-closer'

const IGNITE_TO_DEBATE_HOURS = parseInt(process.env.STATUS_IGNITE_TO_DEBATE_HOURS ?? '6')
const IGNITE_MIN_HEAT = parseInt(process.env.STATUS_IGNITE_MIN_HEAT ?? '30')
const IGNITE_TIMEOUT_HOURS = parseInt(process.env.STATUS_IGNITE_TIMEOUT_HOURS ?? '24')
const DEBATE_MIN_COMMUNITY = parseInt(process.env.STATUS_DEBATE_MIN_COMMUNITY ?? '1')
const CLOSED_IDLE_HOURS = parseInt(process.env.STATUS_CLOSED_IDLE_HOURS ?? '48')
const CLOSED_MAX_HEAT = parseInt(process.env.STATUS_CLOSED_MAX_HEAT ?? '10')
const REIGNITE_RATE_PER_MINUTE = parseInt(process.env.STATUS_REIGNITE_RATE_PER_MINUTE ?? '5')
const REIGNITE_DURATION_MINUTES = parseInt(process.env.STATUS_REIGNITE_DURATION_MINUTES ?? '10')

export interface IssueForTransition {
    id: string
    status: string
    approved_at: string | null
    created_at: string
    heat_index: number | null
}

/**
 * 상태 전환 판단에 필요한 데이터
 */
export interface TransitionData {
    communityCount: number
    recentNewsCount: number
    recentCommunityCount: number
    rapidNewsCount: number
    rapidCommunityCount: number
}

/**
 * 상태 전환 이유 (구조화된 형태)
 */
export interface TransitionReason {
    code:
        | 'HEAT_TOO_LOW'
        | 'IGNITE_TIMEOUT'
        | 'HEAT_AND_COMMUNITY'
        | 'NO_RECENT_DATA'
        | 'REIGNITE_BURST'
        | 'REIGNITE_GRADUAL'
        | 'WAITING'
        | 'COMMUNITY_LACKING'
        | 'HEAT_LACKING'
        | 'UNKNOWN'
    detail: Record<string, number>
    message: string
}

export interface TransitionResult {
    newStatus: string | null
    reason: TransitionReason
}

/**
 * fetchTransitionData - 상태 전환 판단에 필요한 데이터 수집
 * 
 * Supabase 쿼리만 담당하며, 판단 로직은 포함하지 않습니다.
 * status에 따라 필요한 데이터만 조회하여 성능을 최적화합니다.
 * 
 * @param issueId - 이슈 ID
 * @param status - 현재 이슈 상태
 * @returns 상태 전환 판단에 필요한 데이터
 */
async function fetchTransitionData(
    issueId: string,
    status: string
): Promise<TransitionData> {
    const data: TransitionData = {
        communityCount: 0,
        recentNewsCount: 0,
        recentCommunityCount: 0,
        rapidNewsCount: 0,
        rapidCommunityCount: 0,
    }

    if (status === '점화') {
        const { data: communityData } = await supabaseAdmin
            .from('community_data')
            .select('id')
            .eq('issue_id', issueId)
            .limit(DEBATE_MIN_COMMUNITY)
        
        data.communityCount = communityData?.length ?? 0
    }

    if (status === '논란중') {
        const since = new Date(Date.now() - CLOSED_IDLE_HOURS * 60 * 60 * 1000).toISOString()
        
        const [newsRes, communityRes] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('id')
                .eq('issue_id', issueId)
                .gte('created_at', since),
            supabaseAdmin
                .from('community_data')
                .select('id')
                .eq('issue_id', issueId)
                .gte('created_at', since),
        ])

        data.recentNewsCount = newsRes.data?.length ?? 0
        data.recentCommunityCount = communityRes.data?.length ?? 0
    }

    if (status === '종결') {
        const rapidSince = new Date(Date.now() - REIGNITE_DURATION_MINUTES * 60 * 1000).toISOString()
        const since = new Date(Date.now() - CLOSED_IDLE_HOURS * 60 * 60 * 1000).toISOString()
        
        const [newsRes, communityRes] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('created_at')
                .eq('issue_id', issueId)
                .gte('created_at', since),
            supabaseAdmin
                .from('community_data')
                .select('created_at')
                .eq('issue_id', issueId)
                .gte('created_at', since),
        ])

        const allNews = newsRes.data ?? []
        const allCommunity = communityRes.data ?? []
        
        data.rapidNewsCount = allNews.filter(d => d.created_at >= rapidSince).length
        data.rapidCommunityCount = allCommunity.filter(d => d.created_at >= rapidSince).length
        data.recentNewsCount = allNews.length
        data.recentCommunityCount = allCommunity.length
    }

    return data
}

/**
 * evaluateTransition - 상태 전환 조건 평가 (순수 함수)
 * 
 * I/O 없이 입력 데이터만으로 상태 전환 여부를 판단합니다.
 * 단위 테스트 가능하도록 설계되었습니다.
 * 
 * @param issue - 이슈 정보
 * @param data - 전환 판단에 필요한 데이터
 * @returns 전환 결과 (newStatus, reason)
 */
export function evaluateTransition(
    issue: IssueForTransition,
    data: TransitionData
): TransitionResult {
    const heat = issue.heat_index ?? 0
    const baseTime = issue.approved_at ?? issue.created_at
    const elapsedHours = (Date.now() - new Date(baseTime).getTime()) / (1000 * 60 * 60)

    if (issue.status === '점화') {
        // 1. 경과 시간 < 6시간: 대기
        if (elapsedHours < IGNITE_TO_DEBATE_HOURS) {
            return {
                newStatus: null,
                reason: {
                    code: 'WAITING',
                    detail: {
                        elapsed: parseFloat(elapsedHours.toFixed(1)),
                        threshold: IGNITE_TO_DEBATE_HOURS,
                    },
                    message: `경과 ${elapsedHours.toFixed(1)}h — 아직 대기 (기준 ${IGNITE_TO_DEBATE_HOURS}h)`,
                },
            }
        }

        // 2. 타임아웃 조건 (24시간 경과 + 화력 < 30점) - 먼저 체크!
        if (elapsedHours >= IGNITE_TIMEOUT_HOURS && heat < IGNITE_MIN_HEAT) {
            return {
                newStatus: '종결',
                reason: {
                    code: 'IGNITE_TIMEOUT',
                    detail: {
                        elapsed: parseFloat(elapsedHours.toFixed(1)),
                        heat,
                        minHeat: IGNITE_MIN_HEAT,
                    },
                    message: `점화 타임아웃 (${elapsedHours.toFixed(1)}h 경과, 화력 ${heat}점)`,
                },
            }
        }

        // 3. 화력 < 10점: 바이패스 종결
        if (heat < CLOSED_MAX_HEAT) {
            return {
                newStatus: '종결',
                reason: {
                    code: 'HEAT_TOO_LOW',
                    detail: {
                        heat,
                        threshold: CLOSED_MAX_HEAT,
                    },
                    message: `화력 ${heat}점 (종결 임계값 ${CLOSED_MAX_HEAT} 미만) — 바이패스`,
                },
            }
        }

        // 4. 화력 >= 30점: 논란중 전환 시도
        if (heat >= IGNITE_MIN_HEAT) {
            if (data.communityCount >= DEBATE_MIN_COMMUNITY) {
                return {
                    newStatus: '논란중',
                    reason: {
                        code: 'HEAT_AND_COMMUNITY',
                        detail: {
                            heat,
                            communityCount: data.communityCount,
                            elapsed: parseFloat(elapsedHours.toFixed(1)),
                        },
                        message: `화력 ${heat}점, 커뮤니티 ${data.communityCount}건, 경과 ${elapsedHours.toFixed(1)}h`,
                    },
                }
            } else {
                return {
                    newStatus: null,
                    reason: {
                        code: 'COMMUNITY_LACKING',
                        detail: {
                            heat,
                            communityCount: data.communityCount,
                            threshold: DEBATE_MIN_COMMUNITY,
                        },
                        message: `화력 ${heat}점이지만 커뮤니티 반응 부족 (${data.communityCount}건 < ${DEBATE_MIN_COMMUNITY}건)`,
                    },
                }
            }
        }

        // 5. 그 외: 점화 유지 (10점 <= 화력 < 30점, 24시간 미만)
        return {
            newStatus: null,
            reason: {
                code: 'HEAT_LACKING',
                detail: {
                    heat,
                    threshold: IGNITE_MIN_HEAT,
                },
                message: `화력 ${heat}점 — 전환 기준 미달 (최소 ${IGNITE_MIN_HEAT}점)`,
            },
        }
    }

    if (issue.status === '논란중') {
        if (heat < CLOSED_MAX_HEAT) {
            return {
                newStatus: '종결',
                reason: {
                    code: 'HEAT_TOO_LOW',
                    detail: {
                        heat,
                        threshold: CLOSED_MAX_HEAT,
                    },
                    message: `화력 ${heat}점 (종결 임계값 ${CLOSED_MAX_HEAT} 미만)`,
                },
            }
        }

        const recentCount = data.recentNewsCount + data.recentCommunityCount
        if (recentCount === 0) {
            return {
                newStatus: '종결',
                reason: {
                    code: 'NO_RECENT_DATA',
                    detail: {
                        idleHours: CLOSED_IDLE_HOURS,
                    },
                    message: `최근 ${CLOSED_IDLE_HOURS}시간 신규 수집 건 없음`,
                },
            }
        }

        return {
            newStatus: null,
            reason: {
                code: 'WAITING',
                detail: {
                    recentCount,
                    heat,
                },
                message: `신규 수집 ${recentCount}건, 화력 ${heat}점 — 논란 진행 중`,
            },
        }
    }

    if (issue.status === '종결') {
        const rapidCount = data.rapidNewsCount + data.rapidCommunityCount
        const ratePerMinute = rapidCount / REIGNITE_DURATION_MINUTES

        if (ratePerMinute >= REIGNITE_RATE_PER_MINUTE) {
            return {
                newStatus: '논란중',
                reason: {
                    code: 'REIGNITE_BURST',
                    detail: {
                        rapidCount,
                        duration: REIGNITE_DURATION_MINUTES,
                        ratePerMinute: parseFloat(ratePerMinute.toFixed(1)),
                        threshold: REIGNITE_RATE_PER_MINUTE,
                    },
                    message: `재점화: ${rapidCount}건/${REIGNITE_DURATION_MINUTES}분 (분당 ${ratePerMinute.toFixed(1)}건)`,
                },
            }
        }

        const recentCount = data.recentNewsCount + data.recentCommunityCount
        
        if (recentCount > 0 && heat >= IGNITE_MIN_HEAT) {
            return {
                newStatus: '논란중',
                reason: {
                    code: 'REIGNITE_GRADUAL',
                    detail: {
                        recentCount,
                        heat,
                        minHeat: IGNITE_MIN_HEAT,
                    },
                    message: `재점화: 신규 수집 ${recentCount}건, 화력 ${heat}점`,
                },
            }
        }

        return {
            newStatus: null,
            reason: {
                code: 'WAITING',
                detail: {},
                message: '종결 유지',
            },
        }
    }

    return {
        newStatus: null,
        reason: {
            code: 'UNKNOWN',
            detail: {},
            message: '알 수 없는 상태',
        },
    }
}

/**
 * evaluateStatusTransition - 이슈 상태 전환 조건 평가 (래퍼 함수)
 *
 * 데이터 수집(fetchTransitionData)과 판단 로직(evaluateTransition)을 순차 실행합니다.
 * 외부 API는 유지되므로 기존 호출부 수정이 불필요합니다.
 *
 * 예시:
 * const result = await evaluateStatusTransition(issue)
 * if (result.newStatus) { // DB 업데이트 }
 */
export async function evaluateStatusTransition(
    issue: IssueForTransition
): Promise<TransitionResult> {
    const data = await fetchTransitionData(issue.id, issue.status)
    return evaluateTransition(issue, data)
}
