import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* GET /api/admin/logs?target_type=&action=&limit=&offset= */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { searchParams } = request.nextUrl
        const targetType = searchParams.get('target_type')
        const action = searchParams.get('action')
        const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)
        const offset = Number(searchParams.get('offset') ?? 0)

        let query = supabaseAdmin
            .from('admin_logs')
            .select('id, action, target_type, target_id, admin_id, details, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (targetType) {
            query = query.eq('target_type', targetType)
        }
        if (action) {
            query = query.eq('action', action)
        }

        const { data, error, count } = await query

        if (error) throw error

        return NextResponse.json({ data: data ?? [], total: count ?? 0 })
    } catch {
        return NextResponse.json({ error: '로그 조회 실패' }, { status: 500 })
    }
}
