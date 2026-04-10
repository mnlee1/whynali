import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { sanitizeText, validateContent, loadBannedWords } from '@/lib/safety'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/* PATCH /api/admin/discussions/:id
   상태 변경: { action: '진행중' | '마감' | '복구' }
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

            await writeAdminLog('토론 주제 수정', 'discussion_topic', id, auth.adminEmail, sanitized.slice(0, 200))
            revalidatePath('/')
            return NextResponse.json({ data })
        }

        /* ── 상태 변경 ── */
        if (action === undefined) {
            return NextResponse.json(
                { error: 'action 또는 content가 필요합니다.' },
                { status: 400 }
            )
        }

        const VALID_ACTIONS = ['진행중', '마감', '복구'] as const
        if (!VALID_ACTIONS.includes(action)) {
            return NextResponse.json(
                { error: 'action은 진행중 | 마감 | 복구 중 하나여야 합니다.' },
                { status: 400 }
            )
        }

        const updatePayload =
            action === '진행중'
                ? { approval_status: '진행중', approved_at: new Date().toISOString(), auto_end_date: null }
                : action === '마감'
                ? { approval_status: '마감' }
                : { approval_status: '대기', approved_at: null, auto_end_date: null }   // 복구 → 대기

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
        await writeAdminLog(`토론 주제 ${action}`, 'discussion_topic', id, auth.adminEmail, details)
        revalidatePath('/')
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

        await writeAdminLog('토론 주제 삭제', 'discussion_topic', id, auth.adminEmail)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
}
