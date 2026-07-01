import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* GET /api/admin/auto-op-logs?limit=&offset=&job_type=&status= */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = request.nextUrl
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
    const offset = Number(searchParams.get('offset') ?? 0)
    const jobType = searchParams.get('job_type')
    const status = searchParams.get('status')

    try {
        let query = supabaseAdmin
            .from('auto_operation_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (jobType) query = query.eq('job_type', jobType)
        if (status) query = query.eq('status', status)

        const { data, error, count } = await query
        if (error) throw error

        return NextResponse.json({ data: data ?? [], total: count ?? 0 })
    } catch (e) {
        return NextResponse.json({ error: '자동 운영 로그 조회 실패' }, { status: 500 })
    }
}
