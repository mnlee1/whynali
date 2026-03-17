import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

/* GET /api/admin/settings — admin_settings 전체 반환 */
export async function GET() {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
        .from('admin_settings')
        .select('key, value, updated_at')

    if (error) {
        return NextResponse.json(
            { error: 'DB_ERROR', message: '설정 조회에 실패했습니다.' },
            { status: 500 }
        )
    }

    return NextResponse.json({ data: data ?? [] })
}

/* PATCH /api/admin/settings — body: { key, value } upsert */
export async function PATCH(request: NextRequest) {
    let body: { key?: string; value?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'INVALID_BODY', message: '요청 본문이 올바르지 않습니다.' },
            { status: 400 }
        )
    }

    const { key, value } = body
    if (!key || value === undefined) {
        return NextResponse.json(
            { error: 'MISSING_FIELDS', message: 'key와 value가 필요합니다.' },
            { status: 400 }
        )
    }

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
        .from('admin_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select()
        .single()

    if (error) {
        return NextResponse.json(
            { error: 'DB_ERROR', message: '설정 저장에 실패했습니다.' },
            { status: 500 }
        )
    }

    return NextResponse.json({ data })
}
