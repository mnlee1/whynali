/**
 * lib/vote-auto-closer.ts
 *
 * 투표 자동 마감 유틸리티
 *
 * 이슈 상태 변경 시 관련 투표를 자동으로 마감 처리하는 함수들
 */

import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * 이슈와 연결된 모든 진행 중인 투표를 마감 처리
 */
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
        .update({
            phase: '마감',
            ended_at: now,
        })
        .in('id', votes.map(v => v.id))

    if (updateError) {
        console.error(`투표 마감 실패 (이슈: ${issueId}):`, updateError)
        return { success: false, count: 0 }
    }

    console.log(`[투표 자동 마감] 이슈 ${issueId} - ${reason}: ${votes.length}개 투표 마감`)
    return { success: true, count: votes.length }
}

/**
 * 이슈 상태가 '종결'로 변경될 때 호출
 */
export async function closeVotesOnIssueClosed(issueId: string) {
    return await closeVotesByIssue(issueId, '이슈 종결')
}

/**
 * 이슈가 삭제될 때 호출
 */
export async function closeVotesOnIssueDeleted(issueId: string) {
    return await closeVotesByIssue(issueId, '이슈 삭제')
}
