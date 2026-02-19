import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/* GET /api/discussions/:id */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
        .from('discussion_topics')
        .select('*')
        .eq('id', id)
        .eq('approval_status', '승인')
        .single()

    if (error || !data) {
        return NextResponse.json({ error: '토론 주제를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ data })
}
