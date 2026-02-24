/**
 * lib/analysis/status-transition.ts
 *
 * [이슈 상태 자동 전환 로직]
 *
 * 08_이슈상태전환_규격.md §3 기준에 따라 승인된 이슈의 status(점화/논란중/종결)를
 * 자동으로 전환합니다. recalculate-heat Cron에서 화력 재계산 직후 호출됩니다.
 *
 * 전환 규칙:
 *   점화 → 논란중: 승인 후 N시간 경과 + heat_index >= M
 *   점화 → 종결:   승인 후 N시간 경과 + heat_index < K (바이패스)
 *   논란중 → 종결: 화력 K 미만 OR 최근 N시간 신규 수집 건 없음
 *   역방향: 자동 전환 없음 (관리자 수동만)
 */

import { supabaseAdmin } from '@/lib/supabase/server'

// 08_이슈상태전환_규격.md §6 환경변수
const IGNITE_TO_DEBATE_HOURS = parseInt(process.env.STATUS_IGNITE_TO_DEBATE_HOURS ?? '6')
const IGNITE_MIN_HEAT = parseInt(process.env.STATUS_IGNITE_MIN_HEAT ?? '40')
const CLOSED_IDLE_HOURS = parseInt(process.env.STATUS_CLOSED_IDLE_HOURS ?? '48')
const CLOSED_MAX_HEAT = parseInt(process.env.STATUS_CLOSED_MAX_HEAT ?? '10')

interface IssueForTransition {
    id: string
    status: string
    approved_at: string | null
    created_at: string
    heat_index: number | null
}

interface TransitionResult {
    newStatus: string | null // null이면 전환 없음
    reason: string
}

/**
 * evaluateStatusTransition - 이슈 상태 전환 조건 평가
 *
 * 현재 status와 heat_index, 경과 시간을 기반으로 다음 상태를 반환합니다.
 * null 반환 시 전환 불필요 (현재 상태 유지).
 *
 * 예시:
 * const result = await evaluateStatusTransition(issue)
 * if (result.newStatus) { // DB 업데이트 }
 */
export async function evaluateStatusTransition(
    issue: IssueForTransition
): Promise<TransitionResult> {
    const heat = issue.heat_index ?? 0
    const baseTime = issue.approved_at ?? issue.created_at
    const elapsedHours = (Date.now() - new Date(baseTime).getTime()) / (1000 * 60 * 60)

    if (issue.status === '점화') {
        if (elapsedHours < IGNITE_TO_DEBATE_HOURS) {
            return { newStatus: null, reason: `경과 ${elapsedHours.toFixed(1)}h — 아직 대기 (기준 ${IGNITE_TO_DEBATE_HOURS}h)` }
        }

        // 바이패스: 화력이 낮으면 논란중 없이 바로 종결
        if (heat < CLOSED_MAX_HEAT) {
            return { newStatus: '종결', reason: `화력 ${heat}점 (종결 임계값 ${CLOSED_MAX_HEAT} 미만) — 바이패스` }
        }

        // 화력이 충분하면 논란중으로 전환
        if (heat >= IGNITE_MIN_HEAT) {
            return { newStatus: '논란중', reason: `화력 ${heat}점, 경과 ${elapsedHours.toFixed(1)}h` }
        }

        return { newStatus: null, reason: `화력 ${heat}점 — 전환 기준 미달 (최소 ${IGNITE_MIN_HEAT}점)` }
    }

    if (issue.status === '논란중') {
        // 화력 소진
        if (heat < CLOSED_MAX_HEAT) {
            return { newStatus: '종결', reason: `화력 ${heat}점 (종결 임계값 ${CLOSED_MAX_HEAT} 미만)` }
        }

        // 신규 수집 건 없음 확인
        const since = new Date(Date.now() - CLOSED_IDLE_HOURS * 60 * 60 * 1000).toISOString()
        const [newsRes, communityRes] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('id', { count: 'exact', head: true })
                .eq('issue_id', issue.id)
                .gte('created_at', since),
            supabaseAdmin
                .from('community_data')
                .select('id', { count: 'exact', head: true })
                .eq('issue_id', issue.id)
                .gte('created_at', since),
        ])

        const recentCount = (newsRes.count ?? 0) + (communityRes.count ?? 0)
        if (recentCount === 0) {
            return { newStatus: '종결', reason: `최근 ${CLOSED_IDLE_HOURS}시간 신규 수집 건 없음` }
        }

        return { newStatus: null, reason: `신규 수집 ${recentCount}건, 화력 ${heat}점 — 논란 진행 중` }
    }

    // 종결 상태는 자동 전환 없음 (역방향은 관리자 수동만)
    return { newStatus: null, reason: '종결 — 자동 전환 없음' }
}
