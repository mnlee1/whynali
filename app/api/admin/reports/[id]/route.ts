import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

/* PATCH /api/admin/reports/:id — 신고 처리 */
/* body: { action: '처리완료' | '무시' } */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const body = await request.json()
        const action: '처리완료' | '무시' = body.action

        if (action !== '처리완료' && action !== '무시') {
            return NextResponse.json({ error: 'action은 처리완료 또는 무시여야 합니다.' }, { status: 400 })
        }

        /* 신고 레코드 조회 */
        const { data: report } = await supabaseAdmin
            .from('reports')
            .select('id, comment_id, status')
            .eq('id', id)
            .single()

        if (!report) {
            return NextResponse.json({ error: '신고를 찾을 수 없습니다.' }, { status: 404 })
        }

        /* 신고 상태 업데이트 */
        const { error: reportError } = await supabaseAdmin
            .from('reports')
            .update({ status: action })
            .eq('id', id)

        if (reportError) throw reportError

        /* 처리완료: 댓글 내용 조회 후 visibility → deleted_by_admin */
        let logAction = `신고 ${action}`
        let logDetails: string | null = null

        if (action === '처리완료') {
            const { data: comment } = await supabaseAdmin
                .from('comments')
                .select('body')
                .eq('id', report.comment_id)
                .single()

            await supabaseAdmin
                .from('comments')
                .update({ visibility: 'deleted_by_admin', updated_at: new Date().toISOString() })
                .eq('id', report.comment_id)

            logAction = '신고 댓글 삭제'
            logDetails = comment?.body ? `삭제된 댓글: "${comment.body}"` : null
        }

        /* 무시: pending_reason='report'인 댓글만 visibility를 public으로 복구 */
        /* pending_reason='safety'(금칙어)인 댓글은 세이프티봇 영역이므로 복구하지 않음 */
        if (action === '무시') {
            const { data: comment } = await supabaseAdmin
                .from('comments')
                .select('body')
                .eq('id', report.comment_id)
                .single()

            await supabaseAdmin
                .from('comments')
                .update({ 
                    visibility: 'public', 
                    pending_reason: null,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', report.comment_id)
                .eq('visibility', 'pending_review')
                .eq('pending_reason', 'report')

            logAction = '신고 무시 (댓글 복구)'
            logDetails = comment?.body ? `원복된 댓글: "${comment.body}"` : null
        }

        await writeAdminLog(logAction, 'report', id, auth.adminEmail, logDetails)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '신고 처리 실패' }, { status: 500 })
    }
}
