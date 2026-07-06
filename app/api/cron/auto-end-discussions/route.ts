/**
 * app/api/cron/auto-end-discussions/route.ts
 *
 * 토론 주제 자동 마감 크론잡
 * GitHub Actions: .github/workflows/cron-auto-end-discussions.yml (매 시간)
 *
 * 0. 정합성 보정: 이슈 종결 시 마감 예약(auto_end_date) 훅이 누락된 진행중 토론을 찾아 7일 유예 재부여
 *
 * 종결 이슈 연결 토론만 처리:
 * - 마감 당일 24시간 내 댓글 발생 시 +1일 연장
 * - 댓글이 없으면 마감
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
    let reconciledCount = 0

    try {
        const now = new Date()
        const nowIso = now.toISOString()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

        /* 0. 정합성 보정: 이슈 종결 + auto_end_date 누락 진행중 토론 → 7일 유예 재부여 */
        const { data: orphaned, error: orphanedError } = await admin
            .from('discussion_topics')
            .select('id, issues(status)')
            .eq('approval_status', '진행중')
            .is('auto_end_date', null)

        if (orphanedError) throw orphanedError

        const orphanedIds = (orphaned ?? [])
            .filter((t) => (t.issues as any)?.status === '종결')
            .map((t) => t.id)

        if (orphanedIds.length > 0) {
            const reconcileDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
            const { error: reconcileError } = await admin
                .from('discussion_topics')
                .update({ auto_end_date: reconcileDate })
                .in('id', orphanedIds)

            if (reconcileError) throw reconcileError
            reconciledCount = orphanedIds.length
            console.log(`[토론 정합성 보정] 마감 예약 누락 ${reconciledCount}개 → 7일 후 마감 재예약`)
        }

        /* 날짜 기준 만료 토론 조회 (이슈 status 포함) */
        const { data: dateExpiredTopics, error: dateError } = await admin
            .from('discussion_topics')
            .select('id, issues(status)')
            .eq('approval_status', '진행중')
            .not('auto_end_date', 'is', null)
            .lte('auto_end_date', nowIso)

        if (dateError) throw dateError

        if (dateExpiredTopics && dateExpiredTopics.length > 0) {
            const toClose: string[] = []
            const toExtend: string[] = []

            for (const topic of dateExpiredTopics) {
                const issueStatus = (topic.issues as any)?.status

                if (issueStatus === '종결') {
                    /* 종결 이슈 토론: 24시간 내 댓글 여부 확인 */
                    const { count } = await admin
                        .from('comments')
                        .select('id', { count: 'exact', head: true })
                        .eq('discussion_topic_id', topic.id)
                        .gte('created_at', yesterday)

                    if (count && count > 0) {
                        toExtend.push(topic.id)
                    } else {
                        toClose.push(topic.id)
                    }
                }
            }

            /* 마감 처리 */
            if (toClose.length > 0) {
                const { error: closeError } = await admin
                    .from('discussion_topics')
                    .update({ approval_status: '마감' })
                    .in('id', toClose)

                if (closeError) throw closeError
                closedCount += toClose.length
            }

            /* +1일 연장 처리 */
            if (toExtend.length > 0) {
                const extendDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
                const { error: extendError } = await admin
                    .from('discussion_topics')
                    .update({ auto_end_date: extendDate })
                    .in('id', toExtend)

                if (extendError) throw extendError
                extendedCount += toExtend.length
                console.log(`[토론 연장] 종결 이슈 활동 감지 → ${toExtend.length}개 토론 +1일 연장`)
            }
        }

        return NextResponse.json({
            success: true,
            closedCount,
            extendedCount,
            reconciledCount,
            message: `마감 ${closedCount}개, 연장 ${extendedCount}개, 보정 ${reconciledCount}개 처리 완료`,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '자동 종료 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
