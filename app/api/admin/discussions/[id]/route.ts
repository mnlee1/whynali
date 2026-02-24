import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { sanitizeText, validateContent, loadBannedWords } from '@/lib/safety'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/* PATCH /api/admin/discussions/:id
   상태 변경: { action: '승인' | '반려' | '복구' | '종료' }
   내용 수정: { content: string } */
export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const reqBody = await request.json()
        const { action, content } = reqBody

        /* ── 내용 수정 ── */
        if (content !== undefined) {
            const dbBannedWords = await loadBannedWords(supabaseAdmin)
            const { valid, reason } = validateContent(content, 'discussion', dbBannedWords)
            if (!valid) {
                return NextResponse.json({ error: reason }, { status: 400 })
            }
            const sanitized = sanitizeText(content)

            const { data, error } = await supabaseAdmin
                .from('discussion_topics')
                .update({ body: sanitized })
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            if (!data) {
                return NextResponse.json({ error: '토론 주제를 찾을 수 없습니다.' }, { status: 404 })
            }

            await writeAdminLog('수정', 'discussion_topic', id, auth.adminEmail, sanitized.slice(0, 200))
            return NextResponse.json({ data })
        }

        /* ── 상태 변경 ── */
        if (action === undefined) {
            return NextResponse.json(
                { error: 'action 또는 content가 필요합니다.' },
                { status: 400 }
            )
        }

        const VALID_ACTIONS = ['승인', '반려', '복구', '종료'] as const
        if (!VALID_ACTIONS.includes(action)) {
            return NextResponse.json(
                { error: 'action은 승인 | 반려 | 복구 | 종료 중 하나여야 합니다.' },
                { status: 400 }
            )
        }

        const updatePayload =
            action === '승인'
                ? { approval_status: '승인', approved_at: new Date().toISOString() }
                : action === '반려'
                ? { approval_status: '반려', approved_at: null }
                : action === '종료'
                ? { approval_status: '종료' }
                : { approval_status: '대기', approved_at: null }   // 복구 → 대기

        const { data, error } = await supabaseAdmin
            .from('discussion_topics')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json({ error: '토론 주제를 찾을 수 없습니다.' }, { status: 404 })
        }

        const details = data.body ? data.body.slice(0, 200) : null
        await writeAdminLog(action, 'discussion_topic', id, auth.adminEmail, details)
        return NextResponse.json({ data })
    } catch {
        return NextResponse.json({ error: '처리 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/discussions/:id — 완전 삭제 */
export async function DELETE(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { error } = await supabaseAdmin
            .from('discussion_topics')
            .delete()
            .eq('id', id)

        if (error) throw error

        await writeAdminLog('삭제', 'discussion_topic', id, auth.adminEmail)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
}
