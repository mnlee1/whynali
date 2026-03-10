import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

const VALID_REASONS = ['스팸', '욕설/혐오', '허위정보', '기타'] as const
type ReportReason = (typeof VALID_REASONS)[number]

/* POST /api/comments/:id/report */
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
        return NextResponse.json({ error: '올바른 신고 사유를 선택해 주세요.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    const { data: comment } = await admin
        .from('comments')
        .select('id')
        .eq('id', commentId)
        .neq('visibility', 'deleted')
        .maybeSingle()

    if (!comment) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }

    const { error } = await admin
        .from('reports')
        .insert({ comment_id: commentId, reporter_id: user.id, reason })

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: '이미 신고한 댓글입니다.' }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
}
