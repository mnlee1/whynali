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
        /* JOIN 쿼리 시도 */
        const { data, error, count } = await supabaseAdmin
            .from('reports')
            .select(
                'id, comment_id, reason, status, created_at, comments(body, issue_id, discussion_topic_id)',
                { count: 'exact' }
            )
            .eq('status', status)
            .order('created_at', { ascending: true })
            .limit(100)

        /* JOIN 실패 시 fallback: comment_id만 반환 */
        if (error) {
            console.error('[admin/reports] JOIN 쿼리 실패:', error)
            const fallbackResult = await supabaseAdmin
                .from('reports')
                .select('id, comment_id, reason, status, created_at', { count: 'exact' })
                .eq('status', status)
                .order('created_at', { ascending: true })
                .limit(100)

            if (fallbackResult.error) {
                console.error('[admin/reports] fallback 쿼리도 실패:', fallbackResult.error)
                throw fallbackResult.error
            }

            const countMap: Record<string, number> = {}
            for (const r of fallbackResult.data ?? []) {
                countMap[r.comment_id] = (countMap[r.comment_id] ?? 0) + 1
            }

            const result = (fallbackResult.data ?? []).map((r) => ({
                id: r.id,
                comment_id: r.comment_id,
                reason: r.reason,
                status: r.status,
                created_at: r.created_at,
                comment_body: null,
                issue_id: null,
                discussion_topic_id: null,
                report_count: countMap[r.comment_id],
            }))

            return NextResponse.json({ data: result, total: fallbackResult.count ?? 0 })
        }

        /* 같은 comment_id의 신고 건수 집계 */
        const countMap: Record<string, number> = {}
        for (const r of data ?? []) {
            countMap[r.comment_id] = (countMap[r.comment_id] ?? 0) + 1
        }

        const result = (data ?? []).map((r) => ({
            id: r.id,
            comment_id: r.comment_id,
            reason: r.reason,
            status: r.status,
            created_at: r.created_at,
            comment_body: (r.comments as any)?.body ?? null,
            issue_id: (r.comments as any)?.issue_id ?? null,
            discussion_topic_id: (r.comments as any)?.discussion_topic_id ?? null,
            report_count: countMap[r.comment_id],
        }))

        return NextResponse.json({ data: result, total: count ?? 0 })
    } catch (e) {
        console.error('[admin/reports] 예외 발생:', e)
        const errorMessage = e instanceof Error ? e.message : '신고 목록 조회 실패'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
