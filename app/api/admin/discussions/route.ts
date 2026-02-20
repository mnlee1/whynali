import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/* GET /api/admin/discussions?approval_status=&limit=&offset= */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const approvalStatus = searchParams.get('approval_status')
    const limit = Number(searchParams.get('limit') ?? 50)
    const offset = Number(searchParams.get('offset') ?? 0)

    try {
        let query = supabaseAdmin
            .from('discussion_topics')
            .select('*, issues(id, title)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (approvalStatus) {
            query = query.eq('approval_status', approvalStatus)
        }

        const { data, error, count } = await query
        if (error) throw error

        return NextResponse.json({ data: data ?? [], total: count ?? 0 })
    } catch (e) {
        return NextResponse.json({ error: '토론 주제 조회 실패' }, { status: 500 })
    }
}

/* POST /api/admin/discussions — 관리자가 직접 토론 주제 생성 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { issue_id, content } = body

        if (!issue_id || !content?.trim()) {
            return NextResponse.json(
                { error: 'issue_id와 내용이 필요합니다.' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('discussion_topics')
            .insert({
                issue_id,
                body: content.trim(),
                is_ai_generated: false,
                approval_status: '승인',
                approved_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (e) {
        return NextResponse.json({ error: '토론 주제 생성 실패' }, { status: 500 })
    }
}
