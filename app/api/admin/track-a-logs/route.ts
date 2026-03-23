/**
 * app/api/admin/track-a-logs/route.ts
 *
 * [관리자 - Track A 파이프라인 로그 API]
 *
 * track_a_logs 테이블에서 키워드별 처리 결과를 반환합니다.
 * 수집 현황 > 파이프라인 로그 탭에서 사용합니다.
 *
 * Query params:
 *   ?limit=50&offset=0&result=ai_rejected&date=2026-03-23
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = req.nextUrl
    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 200)
    const offset = parseInt(searchParams.get('offset') ?? '0')
    const result = searchParams.get('result') ?? null   // 특정 result 필터
    const date   = searchParams.get('date')   ?? null   // YYYY-MM-DD

    try {
        let query = supabaseAdmin
            .from('track_a_logs')
            .select(`
                id,
                run_at,
                keyword,
                burst_count,
                result,
                issue_id,
                details,
                issues ( id, title, heat_index, approval_status )
            `, { count: 'exact' })
            .order('run_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (result) {
            query = query.eq('result', result)
        }

        if (date) {
            const start = new Date(`${date}T00:00:00+09:00`).toISOString()
            const end   = new Date(`${date}T23:59:59+09:00`).toISOString()
            query = query.gte('run_at', start).lte('run_at', end)
        }

        const { data, count, error } = await query
        if (error) throw error

        // 결과 유형별 집계 (현재 필터 기준 전체 통계)
        const { data: summaryData } = await supabaseAdmin
            .from('track_a_logs')
            .select('result')
            .gte('run_at', date
                ? new Date(`${date}T00:00:00+09:00`).toISOString()
                : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            )

        const summary: Record<string, number> = {}
        summaryData?.forEach(({ result: r }) => {
            summary[r] = (summary[r] ?? 0) + 1
        })

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
            summary,
        })
    } catch (error) {
        console.error('track-a-logs 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: 'Track A 로그 조회 실패' },
            { status: 500 }
        )
    }
}
