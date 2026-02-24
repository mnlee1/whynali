/**
 * app/api/admin/collections/news/route.ts
 *
 * [관리자 - 수집 뉴스 목록 API]
 *
 * 쿼리 파라미터:
 *   page    - 페이지 번호 (기본 1)
 *   limit   - 페이지당 건수 (기본 20, 최대 100)
 *   sort    - 정렬 컬럼: created_at | published_at | source (기본 created_at)
 *   order   - 정렬 방향: desc | asc (기본 desc)
 *   linked  - 연결 필터: true(연결된 것만) | false(미연결만) | 없으면 전체
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_SORT = ['created_at', 'published_at', 'source'] as const
type SortColumn = (typeof ALLOWED_SORT)[number]

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const params = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(params.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20')))
    const sortRaw = params.get('sort') ?? 'created_at'
    const sort: SortColumn = (ALLOWED_SORT as readonly string[]).includes(sortRaw)
        ? (sortRaw as SortColumn)
        : 'created_at'
    const ascending = params.get('order') === 'asc'
    const linkedParam = params.get('linked')
    const offset = (page - 1) * limit

    try {
        let query = supabaseAdmin
            .from('news_data')
            .select(
                'id, title, link, source, published_at, created_at, issue_id, issues(id, title)',
                { count: 'exact' }
            )
            .order(sort, { ascending, nullsFirst: false })

        if (linkedParam === 'true') {
            query = query.not('issue_id', 'is', null)
        } else if (linkedParam === 'false') {
            query = query.is('issue_id', null)
        }

        const { data, count, error } = await query.range(offset, offset + limit - 1)

        if (error) throw error

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
            page,
            limit,
            totalPages: Math.ceil((count ?? 0) / limit),
        })
    } catch (error) {
        console.error('수집 뉴스 목록 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '뉴스 목록 조회 실패' },
            { status: 500 }
        )
    }
}
