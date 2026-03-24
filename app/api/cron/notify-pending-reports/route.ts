/**
 * app/api/cron/notify-pending-reports/route.ts
 *
 * [미처리 신고 일일 알림 Cron]
 *
 * 매일 12:00 KST (03:00 UTC) 실행.
 * reports 테이블에서 status='대기'인 신고를 집계하여
 * Dooray 일일 배치 알림으로 전송합니다.
 *
 * 우선순위 분류:
 *  - priority (🟡): 같은 댓글에 2건 이상 신고
 *  - normal  (🟢): 스팸/광고 · 허위정보 단건 신고
 *  - low     (⚪): 기타 단건 신고
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendDoorayDailyReportSummary } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const { data, error } = await supabaseAdmin
            .from('reports')
            .select('id, comment_id, reason, status, created_at, comments(body, issue_id, discussion_topic_id)')
            .eq('status', '대기')
            .order('created_at', { ascending: true })
            .limit(200)

        if (error) {
            console.error('[notify-pending-reports] DB 조회 실패:', error)
            return NextResponse.json({ error: 'DB_ERROR', message: error.message }, { status: 500 })
        }

        if (!data || data.length === 0) {
            return NextResponse.json({
                success: true,
                message: '처리 대기 중인 신고가 없습니다',
                total: 0,
            })
        }

        // comment_id 기준으로 그룹화 (중복 신고 집계)
        const grouped = new Map<string, { reason: string; count: number; body: string; contextType: string }>()
        for (const r of data) {
            const commentId = r.comment_id
            const existing = grouped.get(commentId)
            const body = (r.comments as any)?.body ?? ''
            const contextType = (r.comments as any)?.discussion_topic_id ? 'discussion' : 'issue'

            if (existing) {
                existing.count += 1
            } else {
                grouped.set(commentId, { reason: r.reason, count: 1, body, contextType })
            }
        }

        const priority: Array<{ commentId: string; body: string; reason: string; reportCount: number; contextType: string }> = []
        const normal: typeof priority = []
        const low: typeof priority = []

        for (const [commentId, info] of grouped.entries()) {
            const item = {
                commentId,
                body: info.body,
                reason: info.reason,
                reportCount: info.count,
                contextType: info.contextType,
            }

            if (info.count >= 2) {
                priority.push(item)
            } else if (info.reason === '스팸/광고' || info.reason === '허위정보') {
                normal.push(item)
            } else {
                low.push(item)
            }
        }

        const sent = await sendDoorayDailyReportSummary({ priority, normal, low })

        return NextResponse.json({
            success: true,
            total: grouped.size,
            priority: priority.length,
            normal: normal.length,
            low: low.length,
            notified: sent,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[notify-pending-reports] Cron 에러:', error)
        return NextResponse.json(
            { error: 'CRON_ERROR', message: '미처리 신고 알림 실패' },
            { status: 500 }
        )
    }
}
