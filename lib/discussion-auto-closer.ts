/**
 * lib/discussion-auto-closer.ts
 *
 * 토론 주제 자동 마감 유틸리티
 *
 * 종결 이슈 마감 정책:
 * - 이슈가 '종결'로 전환되면 즉시 닫지 않고 7일 유예 (auto_end_date 예약)
 * - 7일째 되는 날(마감 전날) 댓글 활동이 있으면 +1일 자동 연장
 * - 활동이 없으면 auto-end-discussions 크론이 정상 마감 처리
 */

import { supabaseAdmin } from '@/lib/supabase/server'

/** 이슈가 '종결' 상태로 전환될 때 호출. 7일 후 자동 마감 예약. */
export async function closeDiscussionsOnIssueClosed(issueId: string) {
    const closeDate = new Date()
    closeDate.setDate(closeDate.getDate() + 7)

    const { data: topics, error: selectError } = await supabaseAdmin
        .from('discussion_topics')
        .select('id')
        .eq('issue_id', issueId)
        .eq('approval_status', '진행중')
        .is('auto_end_date', null)   // 이미 설정된 것은 건드리지 않음

    if (selectError) {
        console.error(`토론 주제 조회 실패 (이슈: ${issueId}):`, selectError)
        return { success: false, count: 0 }
    }

    if (!topics || topics.length === 0) return { success: true, count: 0 }

    const { error: updateError } = await supabaseAdmin
        .from('discussion_topics')
        .update({ auto_end_date: closeDate.toISOString() })
        .in('id', topics.map((t) => t.id))

    if (updateError) {
        console.error(`토론 마감 예약 실패 (이슈: ${issueId}):`, updateError)
        return { success: false, count: 0 }
    }

    console.log(`[토론 마감 예약] 이슈 ${issueId} 종결 → ${topics.length}개 토론 7일 후 마감 예약`)
    return { success: true, count: topics.length }
}

/**
 * 이슈가 재점화(종결 → 논란중)될 때 호출.
 * 종결 시 예약된 auto_end_date를 null로 리셋하여 마감을 취소한다.
 * 이미 마감된 토론은 건드리지 않는다.
 */
export async function cancelDiscussionScheduledClose(issueId: string) {
    const { data: topics, error: selectError } = await supabaseAdmin
        .from('discussion_topics')
        .select('id')
        .eq('issue_id', issueId)
        .eq('approval_status', '진행중')
        .not('auto_end_date', 'is', null)

    if (selectError) {
        console.error(`토론 조회 실패 (이슈: ${issueId}):`, selectError)
        return { success: false, count: 0 }
    }

    if (!topics || topics.length === 0) return { success: true, count: 0 }

    const { error: updateError } = await supabaseAdmin
        .from('discussion_topics')
        .update({ auto_end_date: null })
        .in('id', topics.map((t) => t.id))

    if (updateError) {
        console.error(`토론 마감 취소 실패 (이슈: ${issueId}):`, updateError)
        return { success: false, count: 0 }
    }

    console.log(`[토론 마감 취소] 이슈 ${issueId} 재점화 → ${topics.length}개 토론 마감 예약 취소`)
    return { success: true, count: topics.length }
}
