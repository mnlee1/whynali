import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { parseLimitOffset, parseEnum } from '@/lib/parse-params'
import type { IssueCategory, IssueStatus } from '@/types/issue'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES: readonly IssueCategory[] = ['연예', '스포츠', '정치', '사회', '기술']
const VALID_STATUSES: readonly IssueStatus[] = ['점화', '논란중', '종결']
const VALID_SORTS = ['latest', 'heat'] as const

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

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { title, description, status, category } = body

        if (!title || typeof title !== 'string') {
            return NextResponse.json(
                { error: 'VALIDATION_ERROR', message: 'title 필수' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('issues')
            .insert({
                title: title.trim(),
                description: description?.trim() ?? null,
                status: status ?? '점화',
                category: category ?? '사회',
                approval_status: '대기',
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error) {
        console.error('Issue create error:', error)
        return NextResponse.json(
            { error: 'CREATE_ERROR', message: '이슈 생성 실패' },
            { status: 500 }
        )
    }
}
