import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

const VALID_KINDS = ['banned_word', 'ai_banned_word', 'excluded_word'] as const
type RuleKind = (typeof VALID_KINDS)[number]

/* GET /api/admin/safety/rules?kind= — 금칙어 목록 (kind 없으면 전체) */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const kind = request.nextUrl.searchParams.get('kind') as RuleKind | null

    try {
        let query = supabaseAdmin
            .from('safety_rules')
            .select('id, kind, value, created_at')
            .order('created_at', { ascending: false })

        if (kind && VALID_KINDS.includes(kind)) {
            query = query.eq('kind', kind)
        }

        const { data, error } = await query
        if (error) throw error

        return NextResponse.json({ data: data ?? [] })
    } catch {
        return NextResponse.json({ error: '금칙어 목록 조회 실패' }, { status: 500 })
    }
}

/* POST /api/admin/safety/rules — 금칙어 추가 (kind 기본값: banned_word) */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const word = body.word?.trim()
        const kind: RuleKind = VALID_KINDS.includes(body.kind) ? body.kind : 'banned_word'

        if (!word) {
            return NextResponse.json({ error: '금칙어를 입력해 주세요.' }, { status: 400 })
        }
        if (word.length > 50) {
            return NextResponse.json({ error: '금칙어는 50자 이하로 입력해 주세요.' }, { status: 400 })
        }

        const { data: existing } = await supabaseAdmin
            .from('safety_rules')
            .select('id')
            .eq('kind', kind)
            .eq('value', word)
            .maybeSingle()

        if (existing) {
            return NextResponse.json({ error: '이미 등록된 금칙어입니다.' }, { status: 409 })
        }

        const { data, error } = await supabaseAdmin
            .from('safety_rules')
            .insert({ kind, value: word })
            .select()
            .single()

        if (error) throw error

        await writeAdminLog('금칙어 추가', 'safety_rule', data.id, auth.adminEmail)
        return NextResponse.json({ data }, { status: 201 })
    } catch {
        return NextResponse.json({ error: '금칙어 추가 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/safety/rules?id= — 금칙어 삭제 */
export async function DELETE(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const id = request.nextUrl.searchParams.get('id')
        if (!id) {
            return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('safety_rules')
            .delete()
            .eq('id', id)

        if (error) throw error

        await writeAdminLog('금칙어 삭제', 'safety_rule', id, auth.adminEmail)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '금칙어 삭제 실패' }, { status: 500 })
    }
}
