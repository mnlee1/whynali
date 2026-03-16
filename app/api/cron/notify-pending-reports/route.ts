/**
 * app/api/cron/notify-pending-reports/route.ts
 * 
 * [Cron - 미처리 신고 댓글 알림]
 * 
 * 매일 낮 12시(KST)에 실행하여 미처리 신고 현황을 관리자에게 이메일 발송
 * 
 * 복합 알림 정책 (02_AI기획_판단포인트.md §6.8):
 * - 긴급 신고 (욕설/혐오 1건 이상): 즉시 알림 (실시간, 1시간 쿨다운)
 * - 일반 신고: 매일 12시 배치 알림 (이 API)
 * 
 * 배치 알림 목적:
 * - 긴급하지 않은 신고들을 하루 1회 정리하여 전송
 * - 관리자가 놓친 신고 재확인
 * - 신고 건수 트렌드 파악
 */

import { NextRequest, NextResponse } from 'next/server'
import { notifyPendingReports } from '@/lib/safety-notification'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    // Cron Secret 검증
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: 'UNAUTHORIZED', message: '인증 실패' },
            { status: 401 }
        )
    }

    try {
        console.log('[Cron] 미처리 신고 알림 시작')
        
        const result = await notifyPendingReports()
        
        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: '알림 발송 실패',
                    reportCount: 0,
                    urgentCount: 0
                },
                { status: 500 }
            )
        }
        
        return NextResponse.json({
            success: true,
            message: result.reportCount > 0 
                ? `알림 발송 완료: 전체 ${result.reportCount}건, 긴급 ${result.urgentCount}건`
                : '미처리 신고 없음',
            reportCount: result.reportCount,
            urgentCount: result.urgentCount,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('[Cron] 미처리 신고 알림 실패:', error)
        return NextResponse.json(
            {
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : '알림 발송 중 오류 발생'
            },
            { status: 500 }
        )
    }
}
