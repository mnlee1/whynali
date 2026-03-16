import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sendAdminNotification } from '@/lib/email'
import { sendDoorayPendingReports } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'

/* GET /api/cron/notify-pending-reports — 미처리 신고 배치 알림 */
/* Vercel Cron: 매일 오후 12시 실행 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization')
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (authHeader !== expectedAuth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        /* 대기 중인 신고 건수 조회 */
        const { count: totalCount } = await supabaseAdmin
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', '대기')

        if (!totalCount || totalCount === 0) {
            return NextResponse.json({ message: '미처리 신고 없음', count: 0 })
        }

        /* 사유별 신고 건수 집계 */
        const { data: reportsByReason } = await supabaseAdmin
            .from('reports')
            .select('reason')
            .eq('status', '대기')

        const reasonCounts: Record<string, number> = {
            '욕설/혐오': 0,
            '스팸/광고': 0,
            '허위정보': 0,
            '기타': 0,
        }

        for (const report of reportsByReason ?? []) {
            if (report.reason in reasonCounts) {
                reasonCounts[report.reason]++
            }
        }

        /* Dooray 메신저 알림 (우선) */
        await sendDoorayPendingReports({
            totalCount,
            reasonCounts,
        })
        
        /* 이메일 알림 (백업) */
        await sendAdminNotification({
            subject: `[왜난리] 미처리 신고 ${totalCount}건 대기 중`,
            html: `
                <div style="background-color:#f59e0b;color:white;padding:16px;border-radius:8px 8px 0 0;">
                    <h2 style="margin:0;font-size:18px;font-weight:600;">📋 미처리 신고 알림</h2>
                </div>
                <div style="background-color:#fff;border:1px solid #d1d5db;padding:20px;border-radius:0 0 8px 8px;">
                    <p style="font-size:16px;color:#374151;margin-top:0;">
                        처리 대기 중인 신고가 <strong style="color:#f59e0b;">${totalCount}건</strong> 있습니다.
                    </p>
                    <div style="background-color:#fffbeb;border:1px solid #fcd34d;padding:16px;border-radius:6px;margin:16px 0;">
                        <p style="margin:0 0 12px 0;font-weight:600;color:#92400e;">사유별 현황:</p>
                        <table style="width:100%;border-collapse:collapse;">
                            <tr style="border-bottom:1px solid #fcd34d;">
                                <td style="padding:6px 0;color:#78350f;">욕설/혐오</td>
                                <td style="padding:6px 0;text-align:right;font-weight:600;color:#92400e;">${reasonCounts['욕설/혐오']}건</td>
                            </tr>
                            <tr style="border-bottom:1px solid #fcd34d;">
                                <td style="padding:6px 0;color:#78350f;">스팸/광고</td>
                                <td style="padding:6px 0;text-align:right;font-weight:600;color:#92400e;">${reasonCounts['스팸/광고']}건</td>
                            </tr>
                            <tr style="border-bottom:1px solid #fcd34d;">
                                <td style="padding:6px 0;color:#78350f;">허위정보</td>
                                <td style="padding:6px 0;text-align:right;font-weight:600;color:#92400e;">${reasonCounts['허위정보']}건</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0;color:#78350f;">기타</td>
                                <td style="padding:6px 0;text-align:right;font-weight:600;color:#92400e;">${reasonCounts['기타']}건</td>
                            </tr>
                        </table>
                    </div>
                    <p style="text-align:center;margin:24px 0;">
                        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety" 
                           style="display:inline-block;padding:12px 32px;background-color:#f59e0b;color:white;text-decoration:none;border-radius:6px;font-weight:600;">
                            신고 목록 확인하기
                        </a>
                    </p>
                    <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280;">
                        이 알림은 매일 오후 12시에 자동 발송됩니다.
                    </p>
                </div>
            `,
            text: `미처리 신고 ${totalCount}건\n\n욕설/혐오: ${reasonCounts['욕설/혐오']}건\n스팸/광고: ${reasonCounts['스팸/광고']}건\n허위정보: ${reasonCounts['허위정보']}건\n기타: ${reasonCounts['기타']}건\n\n관리자 페이지: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety`,
        })

        return NextResponse.json({ 
            message: '알림 발송 완료', 
            count: totalCount,
            byReason: reasonCounts,
        })
    } catch (e) {
        console.error('[cron/notify-pending-reports] 실패:', e)
        const errorMessage = e instanceof Error ? e.message : '알림 발송 실패'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
