/**
 * app/api/cron/auto-end-votes/route.ts
 *
 * 투표 자동 종료 크론잡
 *
 * 1. 날짜 기준 자동 종료: auto_end_date가 현재 시각 이전인 진행중 투표를 마감으로 전환
 * 2. 참여자 수 기준 자동 종료: auto_end_participants 목표를 달성한 진행중 투표를 마감으로 전환
 *
 * Vercel Cron으로 매 시간마다 실행 (vercel.json 설정)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    let closedCount = 0

    try {
        // 1. 날짜 기준 자동 종료
        const now = new Date().toISOString()
        const { data: dateExpiredVotes, error: dateError } = await admin
            .from('votes')
            .select('id')
            .eq('phase', '진행중')
            .not('auto_end_date', 'is', null)
            .lte('auto_end_date', now)

        if (dateError) throw dateError

        if (dateExpiredVotes && dateExpiredVotes.length > 0) {
            const { error: updateError } = await admin
                .from('votes')
                .update({
                    phase: '마감',
                    ended_at: now,
                })
                .in('id', dateExpiredVotes.map(v => v.id))

            if (updateError) throw updateError
            closedCount += dateExpiredVotes.length
        }

        // 2. 참여자 수 기준 자동 종료
        const { data: participantVotes, error: participantError } = await admin
            .from('votes')
            .select('id, auto_end_participants, vote_choices(count)')
            .eq('phase', '진행중')
            .not('auto_end_participants', 'is', null)

        if (participantError) throw participantError

        const votesToClose: string[] = []
        if (participantVotes) {
            for (const vote of participantVotes) {
                const totalParticipants = (vote.vote_choices as any[])?.reduce(
                    (sum, choice) => sum + (choice.count || 0),
                    0
                ) || 0

                if (vote.auto_end_participants && totalParticipants >= vote.auto_end_participants) {
                    votesToClose.push(vote.id)
                }
            }
        }

        if (votesToClose.length > 0) {
            const { error: updateError } = await admin
                .from('votes')
                .update({
                    phase: '마감',
                    ended_at: now,
                })
                .in('id', votesToClose)

            if (updateError) throw updateError
            closedCount += votesToClose.length
        }

        return NextResponse.json({
            success: true,
            closedCount,
            message: `${closedCount}개 투표가 자동 종료되었습니다.`,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '자동 종료 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
