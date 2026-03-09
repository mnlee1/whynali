/**
 * lib/vote-auto-closer.ts
 *
 * 투표 자동 마감 유틸리티
 *
 * 이슈 상태 변경 시 관련 투표를 자동으로 마감 처리하는 함수들.
 *
 * 종결 이슈 마감 정책:
 * - 이슈가 '종결'로 전환되면 즉시 닫지 않고 3일 유예 (auto_end_date 예약)
 * - 3일째 되는 날(마감 전날) 투표 참여가 있으면 +1일 자동 연장
 * - 참여가 없으면 auto-end-votes 크론이 정상 마감 처리
 */

import { supabaseAdmin } from '@/lib/supabase/server'

/* 이슈와 연결된 모든 진행중 투표를 즉시 마감 (이슈 삭제 등 강제 종료용) */
export async function closeVotesByIssue(issueId: string, reason: string = '이슈 종결') {
    const now = new Date().toISOString()

    const { data: votes, error: selectError } = await supabaseAdmin
        .from('votes')
        .select('id')
        .eq('issue_id', issueId)
        .eq('phase', '진행중')

    if (selectError) {
        console.error(`투표 조회 실패 (이슈: ${issueId}):`, selectError)
        return { success: false, count: 0 }
    }

    if (!votes || votes.length === 0) {
        return { success: true, count: 0 }
    }

    const { error: updateError } = await supabaseAdmin
        .from('votes')
        .update({ phase: '마감', ended_at: now })
        .in('id', votes.map((v) => v.id))

    if (updateError) {
        console.error(`투표 마감 실패 (이슈: ${issueId}):`, updateError)
        return { success: false, count: 0 }
    }

    console.log(`[투표 자동 마감] 이슈 ${issueId} - ${reason}: ${votes.length}개 투표 마감`)
    return { success: true, count: votes.length }
}

/**
 * 이슈가 '종결' 상태로 전환될 때 호출.
 * 즉시 마감하지 않고 3일 후 자동 마감 예약 (auto_end_date 설정).
 * 이미 auto_end_date가 설정된 투표(관리자 수동 설정)는 건드리지 않음.
 */
export async function closeVotesOnIssueClosed(issueId: string) {
    const closeDate = new Date()
    closeDate.setDate(closeDate.getDate() + 3)

    const { data: votes, error: selectError } = await supabaseAdmin
        .from('votes')
        .select('id')
        .eq('issue_id', issueId)
        .eq('phase', '진행중')
        .is('auto_end_date', null)

    if (selectError) {
        console.error(`투표 조회 실패 (이슈: ${issueId}):`, selectError)
        return { success: false, count: 0 }
    }

    if (!votes || votes.length === 0) {
        return { success: true, count: 0 }
    }

    const { error: updateError } = await supabaseAdmin
        .from('votes')
        .update({ auto_end_date: closeDate.toISOString() })
        .in('id', votes.map((v) => v.id))

    if (updateError) {
        console.error(`투표 마감 예약 실패 (이슈: ${issueId}):`, updateError)
        return { success: false, count: 0 }
    }

    console.log(`[투표 마감 예약] 이슈 ${issueId} 종결 → ${votes.length}개 투표 3일 후 마감 예약`)
    return { success: true, count: votes.length }
}

/* 이슈가 삭제될 때 호출 — 즉시 강제 마감 */
export async function closeVotesOnIssueDeleted(issueId: string) {
    return await closeVotesByIssue(issueId, '이슈 삭제')
}
