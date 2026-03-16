/**
 * app/api/comments/[id]/report/route.ts
 *
 * 댓글/토론 의견 신고 API
 * POST body: { reason: '욕설/혐오' | '스팸' | '허위정보' | '기타' }
 *
 * 신고 정책:
 *   욕설/혐오 1건 → 즉시 Dooray 알림
 *   욕설/혐오 2건 → 자동 임시 숨김(pending_review) + 즉시 Dooray 알림
 *   스팸/광고·허위정보·기타 → 즉시 알림 없음 (매일 12시 배치 알림)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { sendDoorayReportAlert } from '@/lib/dooray-notification'

const VALID_REASONS = ['욕설/혐오', '스팸', '허위정보', '기타'] as const
type ReportReason = (typeof VALID_REASONS)[number]

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: commentId } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const reason: ReportReason = body.reason

    if (!VALID_REASONS.includes(reason)) {
        return NextResponse.json(
            { error: `reason은 ${VALID_REASONS.join(', ')} 중 하나여야 합니다.` },
            { status: 400 }
        )
    }

    const admin = createSupabaseAdminClient()

    // 댓글 존재 여부 확인 (삭제된 댓글은 신고 불가)
    const { data: comment, error: commentError } = await admin
        .from('comments')
        .select('id, body, issue_id, discussion_topic_id, visibility')
        .eq('id', commentId)
        .single()

    if (commentError || !comment) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (comment.visibility === 'deleted') {
        return NextResponse.json({ error: '이미 삭제된 댓글입니다.' }, { status: 422 })
    }

    // 신고 등록 (중복 신고는 UNIQUE 제약으로 차단)
    const { error: insertError } = await admin
        .from('comment_reports')
        .insert({ comment_id: commentId, reporter_id: user.id, reason })

    if (insertError) {
        if (insertError.code === '23505') {
            return NextResponse.json({ error: '이미 신고한 댓글입니다.' }, { status: 409 })
        }
        throw insertError
    }

    // 욕설/혐오 신고 건수 집계 (정책 판단에 사용)
    const { count: hateCount } = await admin
        .from('comment_reports')
        .select('id', { count: 'exact', head: true })
        .eq('comment_id', commentId)
        .eq('reason', '욕설/혐오')

    const hateReportCount = hateCount ?? 0
    const isHate = reason === '욕설/혐오'
    const contextType = comment.discussion_topic_id ? 'discussion' : 'issue'
    const contextId = (comment.discussion_topic_id ?? comment.issue_id) as string

    let autoHidden = false

    if (isHate) {
        // 욕설/혐오 2건 도달 시 자동 임시 숨김
        if (hateReportCount >= 2 && comment.visibility === 'public') {
            await admin
                .from('comments')
                .update({ visibility: 'pending_review' })
                .eq('id', commentId)
            autoHidden = true
        }

        // 욕설/혐오는 항상 즉시 Dooray 알림 (1건, 2건 모두)
        sendDoorayReportAlert({
            commentId,
            body: comment.body,
            reason,
            hateReportCount,
            autoHidden,
            contextType,
            contextId,
        }).catch(e => console.error('[신고 알림 실패]', e))
    }
    // 스팸/광고·허위정보·기타는 즉시 알림 없음 → daily batch에서 처리

    return NextResponse.json({ reported: true, hateReportCount, autoHidden })
}
