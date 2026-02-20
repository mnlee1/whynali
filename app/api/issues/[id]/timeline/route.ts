import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .select('id, occurred_at, source_url, stage, created_at')
            .eq('issue_id', id)
            .order('occurred_at', { ascending: true })

        if (error) throw error

        return NextResponse.json({ data: data ?? [] })
    } catch (error) {
        console.error('Timeline fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '타임라인 조회 실패' },
            { status: 500 }
        )
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const body = await request.json()
        const { occurred_at, source_url, stage } = body

        if (!source_url || typeof source_url !== 'string') {
            return NextResponse.json(
                { error: 'VALIDATION_ERROR', message: 'source_url 필수' },
                { status: 400 }
            )
        }

        const validStages = ['발단', '전개', '파생', '진정']
        const stageValue = validStages.includes(stage) ? stage : '발단'
        const occurredAt = occurred_at ? new Date(occurred_at).toISOString() : new Date().toISOString()

        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .insert({
                issue_id: id,
                occurred_at: occurredAt,
                source_url: source_url.trim(),
                stage: stageValue,
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error) {
        console.error('Timeline create error:', error)
        return NextResponse.json(
            { error: 'CREATE_ERROR', message: '타임라인 생성 실패' },
            { status: 500 }
        )
    }
}
