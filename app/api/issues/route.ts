import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { IssueCategory, IssueStatus } from '@/types/issue'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category') as IssueCategory | null
    const status = searchParams.get('status') as IssueStatus | null
    const q = searchParams.get('q')
    const sort = searchParams.get('sort') || 'latest'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    try {
        let query = supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .eq('approval_status', '승인')

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
            query = query.order('updated_at', { ascending: false })
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
