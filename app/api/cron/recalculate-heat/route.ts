/**
 * app/api/cron/recalculate-heat/route.ts
 * 
 * [화력 분석 자동화 Cron]
 * 
 * 모든 승인된 이슈의 화력 지수를 재계산합니다.
 * Vercel Cron으로 10분마다 실행됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { recalculateHeatForIssue } from '@/lib/analysis/heat'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const startTime = Date.now()

        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .eq('approval_status', '승인')
            .order('updated_at', { ascending: false })
            .limit(100)

        if (!issues || issues.length === 0) {
            return NextResponse.json({
                success: true,
                message: '처리할 이슈가 없습니다',
                processed: 0,
            })
        }

        const results: Array<{
            issueId: string
            issueTitle: string
            heatIndex: number
        }> = []

        for (const issue of issues) {
            try {
                const heatIndex = await recalculateHeatForIssue(issue.id)
                results.push({
                    issueId: issue.id,
                    issueTitle: issue.title,
                    heatIndex,
                })
            } catch (err) {
                console.error(`이슈 ${issue.id} 화력 계산 실패:`, err)
            }
        }

        const elapsed = Date.now() - startTime
        const avgHeat =
            results.reduce((sum, r) => sum + r.heatIndex, 0) / results.length

        return NextResponse.json({
            success: true,
            processed: results.length,
            avgHeat: avgHeat.toFixed(2),
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
            details: results.slice(0, 10),
        })
    } catch (error) {
        console.error('화력 분석 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'HEAT_RECALCULATION_ERROR',
                message: '화력 분석 실패',
            },
            { status: 500 }
        )
    }
}
