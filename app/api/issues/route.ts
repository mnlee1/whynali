import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { parseLimitOffset, parseEnum } from '@/lib/parse-params'
import type { IssueCategory, IssueStatus } from '@/types/issue'
import { getCategoryIds } from '@/lib/config/categories'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'icn1'

const VALID_CATEGORIES = getCategoryIds() as readonly IssueCategory[]
const VALID_STATUSES: readonly IssueStatus[] = ['점화', '논란중', '종결']
const VALID_SORTS = ['latest', 'heat'] as const
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    const pagination = parseLimitOffset(searchParams, { defaultLimit: 20, maxLimit: 100 })
    if (pagination.error) return pagination.error

    const rawCategory = searchParams.get('category')
    const rawStatus = searchParams.get('status')
    const rawSort = searchParams.get('sort')

    const categoryResult = parseEnum(rawCategory, VALID_CATEGORIES, '사회', false)
    const statusResult = parseEnum(rawStatus, VALID_STATUSES, '점화', false)
    const sortResult = parseEnum(rawSort, VALID_SORTS, 'latest', false)

    const category = rawCategory ? categoryResult.value : null
    const status = rawStatus ? statusResult.value : null
    const sort = sortResult.value
    const { limit, offset } = pagination
    const q = searchParams.get('q')

    try {
        let query = supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .gte('heat_index', MIN_HEAT_TO_REGISTER)

        if (category) {
            query = query.eq('category', category)
        }

        if (status) {
            query = query.eq('status', status)
        }

        if (q && q.trim()) {
            query = query.or(`title.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`)
        }

        if (sort === 'heat') {
            query = query.order('heat_index', { ascending: false, nullsFirst: false })
        } else {
            query = query.order('created_at', { ascending: false })
        }

        query = query.range(offset, offset + limit - 1)

        const { data, error, count } = await query

        if (error) throw error

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
        })
    } catch (error) {
        console.error('Issues fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '이슈 목록 조회 실패' },
            { status: 500 }
        )
    }
}

// POST 메서드는 제거됨 - 이슈는 트랙 A 프로세스를 통해서만 생성됨
// 수동 생성 기능은 실제 사용 사례가 없어 2026-03-16에 제거됨
