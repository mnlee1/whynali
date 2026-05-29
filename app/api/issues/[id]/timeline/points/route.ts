/**
 * app/api/issues/[id]/timeline/points/route.ts
 *
 * 숏폼 소스용 타임라인 포인트 조회
 * AI 요약 캐시(timeline_summaries) 대신 원본 포인트(timeline_points)를 직접 반환.
 * 각 포인트의 ai_summary → title 순서로 텍스트를 선택한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type TimelineStage = '발단' | '전개' | '파생' | '진정' | '종결'

const STAGE_ORDER: Record<TimelineStage, number> = {
    '발단': 0, '전개': 1, '파생': 2, '진정': 3, '종결': 4,
}

export interface TimelinePoint {
    stage: TimelineStage
    text: string
    occurred_at: string
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .select('stage, title, ai_summary, occurred_at')
            .eq('issue_id', id)
            .order('occurred_at', { ascending: true })

        if (error) throw error

        const points: TimelinePoint[] = (data ?? [])
            .sort((a, b) => {
                const stageDiff =
                    (STAGE_ORDER[a.stage as TimelineStage] ?? 9) -
                    (STAGE_ORDER[b.stage as TimelineStage] ?? 9)
                if (stageDiff !== 0) return stageDiff
                return a.occurred_at.localeCompare(b.occurred_at)
            })
            .map(row => ({
                stage: row.stage as TimelineStage,
                text: (row.ai_summary || row.title || '').trim(),
                occurred_at: row.occurred_at,
            }))
            .filter(p => p.text.length > 0)

        return NextResponse.json({ data: points })
    } catch (error) {
        console.error('[timeline/points] 오류:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '포인트 조회 실패' },
            { status: 500 }
        )
    }
}
