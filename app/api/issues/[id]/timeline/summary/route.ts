/**
 * app/api/issues/[id]/timeline/summary/route.ts
 *
 * 이슈 타임라인 AI 요약 조회 API
 * Groq 호출 없이 timeline_summaries 캐시 테이블만 읽음
 * 요약 생성은 update-timeline cron에서 담당
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type TimelineStage = '발단' | '전개' | '파생' | '진정' | '종결'

const STAGE_ORDER: Record<TimelineStage, number> = {
    '발단': 0, '전개': 1, '파생': 2, '진정': 3, '종결': 4,
}

export interface StageSummary {
    stage: TimelineStage
    stageTitle: string
    bullets: Array<string | { date: string; text: string }>
    dateStart: string
    dateEnd: string
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_summaries')
            .select('stage, stage_title, bullets, date_start, date_end')
            .eq('issue_id', id)

        if (error) throw error

        const sorted = (data ?? [])
            .sort((a, b) => (STAGE_ORDER[a.stage as TimelineStage] ?? 9) - (STAGE_ORDER[b.stage as TimelineStage] ?? 9))
            .map(row => ({
                stage: row.stage as TimelineStage,
                stageTitle: row.stage_title,
                bullets: row.bullets || [],
                dateStart: row.date_start,
                dateEnd: row.date_end,
            }))

        return NextResponse.json({ data: sorted })
    } catch (error) {
        console.error('[timeline/summary] 오류:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '요약 조회 실패' },
            { status: 500 }
        )
    }
}
