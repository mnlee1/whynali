/**
 * app/api/cron/auto-end-votes/route.ts
 *
 * 투표 자동 종료 크론잡
 * GitHub Actions: .github/workflows/cron-auto-end-votes.yml (매 시간)
 *
 * 1. 날짜 기준 자동 종료
 *    - 종결 이슈 연결 투표: 마감 당일 24시간 내 참여 발생 시 +1일 연장, 없으면 마감
 *    - 일반 투표: auto_end_date 경과 즉시 마감
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const admin = createSupabaseAdminClient()
    let closedCount = 0
    let extendedCount = 0

    try {
        const now = new Date()
        const nowIso = now.toISOString()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

        /* 1. 날짜 기준 만료 투표 조회 (이슈 status 포함) */
        const { data: dateExpiredVotes, error: dateError } = await admin
            .from('votes')
            .select('id, issues(status)')
            .eq('phase', '진행중')
            .not('auto_end_date', 'is', null)
            .lte('auto_end_date', nowIso)

        if (dateError) throw dateError

        if (dateExpiredVotes && dateExpiredVotes.length > 0) {
            const toClose: string[] = []
            const toExtend: string[] = []

            for (const vote of dateExpiredVotes) {
                const issueStatus = (vote.issues as any)?.status

                if (issueStatus === '종결') {
                    /* 종결 이슈 투표: 24시간 내 참여 여부 확인 */
                    const { count } = await admin
                        .from('user_votes')
                        .select('id', { count: 'exact', head: true })
                        .eq('vote_id', vote.id)
                        .gte('created_at', yesterday)

                    if (count && count > 0) {
                        toExtend.push(vote.id)
                    } else {
                        toClose.push(vote.id)
                    }
                } else {
                    toClose.push(vote.id)
                }
            }

            /* 마감 처리 */
            if (toClose.length > 0) {
                const { error: closeError } = await admin
                    .from('votes')
                    .update({ phase: '마감', ended_at: nowIso })
                    .in('id', toClose)

                if (closeError) throw closeError
                closedCount += toClose.length
            }

            /* +1일 연장 처리 */
            if (toExtend.length > 0) {
                const extendDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
                const { error: extendError } = await admin
                    .from('votes')
                    .update({ auto_end_date: extendDate })
                    .in('id', toExtend)

                if (extendError) throw extendError
                extendedCount += toExtend.length
                console.log(`[투표 연장] 종결 이슈 활동 감지 → ${toExtend.length}개 투표 +1일 연장`)
            }
        }

        return NextResponse.json({
            success: true,
            closedCount,
            extendedCount,
            message: `마감 ${closedCount}개, 연장 ${extendedCount}개 처리`,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '자동 종료 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
