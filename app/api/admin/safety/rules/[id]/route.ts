import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

const VALID_KINDS = ['banned_word', 'ai_banned_word', 'excluded_word'] as const
type RuleKind = (typeof VALID_KINDS)[number]

/* PATCH /api/admin/safety/rules/:id — kind 변경 (제외 처리 / 복원 용도) */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const body = await request.json()
        const kind: RuleKind = body.kind

        if (!VALID_KINDS.includes(kind)) {
            return NextResponse.json({ error: '올바른 kind 값이 아닙니다.' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('safety_rules')
            .update({ kind })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json({ error: '규칙을 찾을 수 없습니다.' }, { status: 404 })
        }

        await writeAdminLog(`금칙어 kind 변경 → ${kind}`, 'safety_rule', id, auth.adminEmail)
        return NextResponse.json({ data })
    } catch {
        return NextResponse.json({ error: 'kind 변경 실패' }, { status: 500 })
    }
}
