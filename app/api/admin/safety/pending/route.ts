import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/* GET /api/admin/safety/pending — visibility='pending_review' 댓글 목록 */
export async function GET() {
    try {
        const { data, error, count } = await supabaseAdmin
            .from('comments')
            .select('id, body, user_id, issue_id, discussion_topic_id, created_at', { count: 'exact' })
            .eq('visibility', 'pending_review')
            .order('created_at', { ascending: true })
            .limit(50)

        if (error) throw error

        return NextResponse.json({ data: data ?? [], total: count ?? 0 })
    } catch {
        return NextResponse.json({ error: '검토 대기 댓글 조회 실패' }, { status: 500 })
    }
}
