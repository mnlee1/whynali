import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .select('*')
            .eq('issue_id', id)
            .order('occurred_at', { ascending: true })

        if (error) throw error

        return NextResponse.json({ data: data ?? [] })
    } catch (error) {
        console.error('Timeline fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '타임라인 조회 실패' },
            { status: 500 }
        )
    }
}
