import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* GET /api/admin/reports?status=대기 — 신고 목록 (기본: 대기) */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const status = request.nextUrl.searchParams.get('status') ?? '대기'

    try {
        const { data, error, count } = await supabaseAdmin
            .from('reports')
            .select(
                'id, comment_id, reason, status, created_at, comments(body, issue_id, discussion_topic_id)',
                { count: 'exact' }
            )
            .eq('status', status)
            .order('created_at', { ascending: true })
            .limit(100)

        if (error) throw error

        /* 같은 comment_id의 신고 건수 집계 */
        const countMap: Record<string, number> = {}
        for (const r of data ?? []) {
            countMap[r.comment_id] = (countMap[r.comment_id] ?? 0) + 1
        }

        type Row = (typeof data)[number] & {
            comments?: {
                body: string | null
                issue_id: string | null
                discussion_topic_id: string | null
            } | null
        }

        const result = (data ?? []).map((r: Row) => ({
            id: r.id,
            comment_id: r.comment_id,
            reason: r.reason,
            status: r.status,
            created_at: r.created_at,
            comment_body: r.comments?.body ?? null,
            issue_id: r.comments?.issue_id ?? null,
            discussion_topic_id: r.comments?.discussion_topic_id ?? null,
            report_count: countMap[r.comment_id],
        }))

        return NextResponse.json({ data: result, total: count ?? 0 })
    } catch {
        return NextResponse.json({ error: '신고 목록 조회 실패' }, { status: 500 })
    }
}
