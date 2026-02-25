import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* GET /api/admin/discussions?approval_status=&limit=&offset= */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

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
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, content, approval_status = '승인' } = body

        if (!issue_id || !content?.trim()) {
            return NextResponse.json(
                { error: 'issue_id와 내용이 필요합니다.' },
                { status: 400 }
            )
        }

        const validStatuses = ['대기', '승인', '반려']
        if (!validStatuses.includes(approval_status)) {
            return NextResponse.json(
                { error: 'approval_status는 대기|승인|반려 중 하나여야 합니다.' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('discussion_topics')
            .insert({
                issue_id,
                body: content.trim(),
                is_ai_generated: false,
                approval_status,
                approved_at: approval_status === '승인' ? new Date().toISOString() : null,
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (e) {
        return NextResponse.json({ error: '토론 주제 생성 실패' }, { status: 500 })
    }
}
