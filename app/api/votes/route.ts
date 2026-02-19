import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/* GET /api/votes?issue_id= */
export async function GET(request: NextRequest) {
    const issue_id = request.nextUrl.searchParams.get('issue_id')

    if (!issue_id) {
        return NextResponse.json({ error: 'issue_id가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
        .from('votes')
        .select('*, vote_choices(*)')
        .eq('issue_id', issue_id)
        .order('created_at', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
}
