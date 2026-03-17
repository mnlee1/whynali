import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sendDoorayReportAlert } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'

const VALID_REASONS = ['욕설/혐오', '스팸/광고', '허위정보', '기타'] as const
type ReportReason = (typeof VALID_REASONS)[number]

/* POST /api/comments/[id]/report — 특정 댓글 신고 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json(
            { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
            { status: 401 }
        )
    }

    const { id: comment_id } = await params

    let body: { reason?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: '요청 본문을 파싱할 수 없습니다.' },
            { status: 400 }
        )
    }

    const { reason } = body

    if (!reason) {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'reason은 필수입니다.' },
            { status: 400 }
        )
    }

    if (!VALID_REASONS.includes(reason as ReportReason)) {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: `reason은 ${VALID_REASONS.join(' | ')} 중 하나여야 합니다.` },
            { status: 400 }
        )
    }

    /* 댓글 존재 여부 확인 (이슈/토론 정보도 함께) */
    const { data: comment } = await supabaseAdmin
        .from('comments')
        .select('id, body, issue_id, discussion_topic_id')
        .eq('id', comment_id)
        .neq('visibility', 'deleted')
        .maybeSingle()

    if (!comment) {
        return NextResponse.json(
            { error: 'NOT_FOUND', message: '존재하지 않는 댓글입니다.' },
            { status: 404 }
        )
    }

    /* reports INSERT — UNIQUE(comment_id, reporter_id)로 중복 신고 방지 */
    const { error: insertError } = await supabaseAdmin
        .from('reports')
        .insert({ comment_id, reporter_id: user.id, reason, status: '대기' })

    if (insertError) {
        if (insertError.code === '23505') {
            return NextResponse.json(
                { error: 'DUPLICATE', message: '이미 신고한 댓글입니다.' },
                { status: 409 }
            )
        }
        console.error('[comments/report] INSERT 실패:', insertError)
        return NextResponse.json(
            { error: 'SERVER_ERROR', message: '신고 처리 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }

    /* 신고 건수 확인 (현재 신고 포함) */
    const { count: reportCount } = await supabaseAdmin
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('comment_id', comment_id)
        .eq('status', '대기')

    const currentReportCount = reportCount ?? 1

    /* 자동 임시 숨김 임계값 체크 */
    const shouldAutoHide = 
        (reason === '욕설/혐오' && currentReportCount >= 2) ||
        (reason === '스팸/광고' && currentReportCount >= 3) ||
        (reason === '허위정보' && currentReportCount >= 3) ||
        (reason === '기타' && currentReportCount >= 5)

    if (shouldAutoHide) {
        await supabaseAdmin
            .from('comments')
            .update({ visibility: 'pending_review', updated_at: new Date().toISOString() })
            .eq('id', comment_id)
    }

    /* 욕설/혐오는 즉시 알림 (비동기, 실패해도 신고는 성공) */
    if (reason === '욕설/혐오') {
        void sendDoorayReportAlert({
            commentId: comment_id,
            body: comment.body,
            reason,
            hateReportCount: currentReportCount,
            autoHidden: shouldAutoHide,
            contextType: comment.discussion_topic_id ? 'discussion' : 'issue',
            contextId: comment.discussion_topic_id || comment.issue_id || '',
        })
    }

    return NextResponse.json({ 
        message: shouldAutoHide 
            ? '신고가 접수되었습니다. 다수 신고로 인해 해당 댓글이 임시 숨김 처리되었습니다.'
            : '신고가 접수되었습니다.'
    }, { status: 201 })
}
