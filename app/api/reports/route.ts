import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_REASONS = ['욕설/혐오', '스팸/광고', '허위정보', '기타'] as const
type ReportReason = (typeof VALID_REASONS)[number]

/* POST /api/reports — 로그인 사용자가 특정 댓글을 신고 */
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json(
            { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
            { status: 401 }
        )
    }

    let body: { comment_id?: string; reason?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: '요청 본문을 파싱할 수 없습니다.' },
            { status: 400 }
        )
    }

    const { comment_id, reason } = body

    if (!comment_id || !reason) {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'comment_id와 reason은 필수입니다.' },
            { status: 400 }
        )
    }

    if (!VALID_REASONS.includes(reason as ReportReason)) {
        return NextResponse.json(
            { error: 'BAD_REQUEST', message: `reason은 ${VALID_REASONS.join(' | ')} 중 하나여야 합니다.` },
            { status: 400 }
        )
    }

    /* 댓글 존재 여부 확인 */
    const { data: comment } = await supabaseAdmin
        .from('comments')
        .select('id')
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
        return NextResponse.json(
            { error: 'SERVER_ERROR', message: '신고 처리 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }

    return NextResponse.json({ message: '신고가 접수되었습니다.' }, { status: 201 })
}
