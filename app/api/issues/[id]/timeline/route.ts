import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { parseEnum, parseUrl } from '@/lib/parse-params'
import type { TimelineStage } from '@/types/issue'

export const dynamic = 'force-dynamic'

const VALID_STAGES: readonly TimelineStage[] = ['발단', '전개', '파생', '진정']

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .select('*')
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
        const { occurred_at, source_url, stage, title } = body

        const stageResult = parseEnum(stage ?? null, VALID_STAGES, '발단', false)
        const stageValue = stageResult.value

        let occurredAt: string
        try {
            occurredAt = occurred_at ? new Date(occurred_at).toISOString() : new Date().toISOString()
        } catch {
            return NextResponse.json(
                { error: 'INVALID_PARAM', message: 'occurred_at이 올바른 날짜 형식이 아닙니다.' },
                { status: 400 }
            )
        }

        const urlResult = parseUrl(source_url ?? null, 'source_url')
        if (urlResult.error) return urlResult.error
        const sourceUrlValue = urlResult.value

        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .insert({
                issue_id: id,
                occurred_at: occurredAt,
                source_url: sourceUrlValue,
                stage: stageValue,
                title: title ? String(title).trim() : null,
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
