/**
 * app/api/admin/collections/community/route.ts
 *
 * [관리자 - 수집 커뮤니티 목록 API]
 *
 * 쿼리 파라미터:
 *   page    - 페이지 번호 (기본 1)
 *   limit   - 페이지당 건수 (기본 20, 최대 100)
 *   sort    - 정렬 컬럼: written_at | created_at | view_count | comment_count | source_site (기본 comment_count)
 *   order   - 정렬 방향: desc | asc (기본 desc)
 *   site    - 사이트 필터: 더쿠 | 네이트판 | 없으면 전체
 *   linked  - 연결 필터: true(연결된 것만) | false(미연결만) | 없으면 전체
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_SORT = ['written_at', 'created_at', 'view_count', 'comment_count', 'source_site'] as const
type SortColumn = (typeof ALLOWED_SORT)[number]

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const params = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(params.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20')))
    const sortRaw = params.get('sort') ?? 'comment_count'
    const sort: SortColumn = (ALLOWED_SORT as readonly string[]).includes(sortRaw)
        ? (sortRaw as SortColumn)
        : 'comment_count'
    const ascending = params.get('order') === 'asc'
    const site = params.get('site')
    const linkedParam = params.get('linked')
    const offset = (page - 1) * limit

    try {
        let query = supabaseAdmin
            .from('community_data')
            .select(
                'id, title, source_site, view_count, comment_count, written_at, created_at, url, issue_id, issues(id, title)',
                { count: 'exact' }
            )
            .order(sort, { ascending, nullsFirst: false })

        if (site === '더쿠' || site === '네이트판') {
            query = query.eq('source_site', site)
        }

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
        console.error('수집 커뮤니티 목록 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '커뮤니티 목록 조회 실패' },
            { status: 500 }
        )
    }
}
