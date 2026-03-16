/**
 * lib/safety-notification.ts
 *
 * 세이프티 검토 대기 알림 기능
 * 02_AI기획_판단포인트.md §6.5, §6.6 기준
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'

const PENDING_THRESHOLD = 10 // 검토 대기 10건 이상 시 알림

/**
 * 검토 대기 댓글 건수 확인 및 알림 발송
 * 댓글/토론 댓글 작성 시 pendingReview=true일 때 호출
 */
export async function checkAndNotifyPendingReview(): Promise<void> {
    try {
        const admin = createSupabaseAdminClient()
        
        const { count } = await admin
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('visibility', 'pending_review')
        
        if (!count || count < PENDING_THRESHOLD) {
            return
        }
        
        // 10건 이상일 때만 알림 발송
        await sendAdminNotification({
            subject: '세이프티 검토 대기 알림',
            html: `
                <h2>세이프티 검토 대기 알림</h2>
                <p>검토 대기 중인 댓글이 <strong>${count}건</strong>입니다.</p>
                <p>관리자 페이지에서 확인해 주세요.</p>
                <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety">세이프티 관리 페이지로 이동</a></p>
            `
        })
    } catch (error) {
        // 알림 실패는 로그만 남기고 에러를 던지지 않음 (댓글 작성 자체는 성공)
        console.error('세이프티 알림 발송 실패:', error)
    }
}

/**
 * 마지막 알림 발송 시각 추적 (메모리 기반)
 * 같은 시간대에 중복 알림 방지 (10분 이내 재발송 방지)
 */
let lastNotificationTime = 0
const NOTIFICATION_COOLDOWN = 10 * 60 * 1000 // 10분

/**
 * 쿨다운 체크가 포함된 알림 함수
 * 10분 이내에는 재발송하지 않음
 */
export async function checkAndNotifyWithCooldown(): Promise<void> {
    const now = Date.now()
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        return // 10분 이내 이미 발송함
    }
    
    lastNotificationTime = now
    await checkAndNotifyPendingReview()
}

/**
 * 미처리 신고 댓글 알림 (배치 작업용)
 * 매일 정기적으로 실행하여 관리자에게 미처리 신고 현황 전송
 * 
 * 복합 알림 정책 (02_AI기획_판단포인트.md §6.8):
 * - 긴급 신고 (욕설/혐오 1건 이상): 즉시 알림 (1시간 쿨다운)
 * - 일반 신고: 매일 12시 배치 알림
 */
export async function notifyPendingReports(): Promise<{ success: boolean; reportCount: number; urgentCount: number }> {
    try {
        const admin = createSupabaseAdminClient()
        
        // 1. 대기 중인 신고 목록 조회
        const { data: reports, error } = await admin
            .from('reports')
            .select(`
                id,
                comment_id,
                reason,
                created_at,
                comments(body, issue_id, discussion_topic_id)
            `)
            .eq('status', '대기')
            .order('created_at', { ascending: true })
        
        if (error) throw error
        
        if (!reports || reports.length === 0) {
            console.log('[신고 알림] 미처리 신고 없음')
            return { success: true, reportCount: 0, urgentCount: 0 }
        }
        
        // 2. 신고 건수 집계 (같은 댓글에 대한 중복 신고 카운트)
        const commentCountMap: Record<string, number> = {}
        for (const r of reports) {
            commentCountMap[r.comment_id] = (commentCountMap[r.comment_id] ?? 0) + 1
        }
        
        // 3. 긴급 신고 분류 (욕설/혐오)
        const urgentReports = reports.filter(r => r.reason === '욕설/혐오')
        const normalReports = reports.filter(r => r.reason !== '욕설/혐오')
        
        // 4. 알림 HTML 생성
        let htmlContent = `
            <h2>📋 미처리 신고 알림</h2>
            <p>검토 대기 중인 신고가 <strong>${reports.length}건</strong> 있습니다.</p>
            <p style="color: #666; font-size: 14px;">
                매일 낮 12시 정기 알림입니다. (긴급 건 제외)
            </p>
        `
        
        if (urgentReports.length > 0) {
            htmlContent += `
                <div style="background: #fee; padding: 12px; border-left: 4px solid #d00; margin: 16px 0;">
                    <h3 style="color: #d00; margin: 0 0 8px 0;">🔴 긴급 검토 필요 (욕설/혐오)</h3>
                    <p style="margin: 0;">${urgentReports.length}건</p>
                </div>
            `
        }
        
        if (normalReports.length > 0) {
            htmlContent += `
                <div style="background: #ffc; padding: 12px; border-left: 4px solid #fa0; margin: 16px 0;">
                    <h3 style="color: #f80; margin: 0 0 8px 0;">🟡 일반 신고</h3>
                    <p style="margin: 0;">${normalReports.length}건</p>
                </div>
            `
        }
        
        // 5. 우선순위 상위 5건 미리보기
        type ReportWithCount = typeof reports[number] & { report_count: number }
        const reportsWithCount: ReportWithCount[] = reports.map(r => ({
            ...r,
            report_count: commentCountMap[r.comment_id] ?? 1
        }))
        
        // 우선순위 정렬 (욕설/혐오 > 다건 신고 > 최신)
        const sortedReports = reportsWithCount.sort((a, b) => {
            if (a.reason === '욕설/혐오' && b.reason !== '욕설/혐오') return -1
            if (a.reason !== '욕설/혐오' && b.reason === '욕설/혐오') return 1
            if (a.report_count !== b.report_count) return b.report_count - a.report_count
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
        
        const topReports = sortedReports.slice(0, 5)
        
        htmlContent += `
            <h3>📌 우선 검토 대상 (상위 5건)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">사유</th>
                        <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">신고 건수</th>
                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">댓글 내용</th>
                    </tr>
                </thead>
                <tbody>
        `
        
        for (const report of topReports) {
            const commentBody = (report.comments as any)?.body ?? '(삭제된 댓글)'
            const displayBody = commentBody.length > 50 ? commentBody.substring(0, 50) + '...' : commentBody
            const reasonBadge = report.reason === '욕설/혐오' 
                ? `<span style="background: #d00; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${report.reason}</span>`
                : `<span style="background: #fa0; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${report.reason}</span>`
            
            htmlContent += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${reasonBadge}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                        ${report.report_count >= 2 ? `<strong>${report.report_count}건</strong>` : '1건'}
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd; color: #666;">${displayBody}</td>
                </tr>
            `
        }
        
        htmlContent += `
                </tbody>
            </table>
            <p style="margin-top: 24px;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.vercel.app'}/admin/safety" 
                   style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                    세이프티 관리 페이지로 이동
                </a>
            </p>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px;">
                · 욕설/혐오 신고는 1건만 접수되어도 즉시 알림 발송됩니다 (1시간 쿨다운)<br>
                · 일반 신고는 매일 낮 12시에 배치 알림으로 발송됩니다<br>
                · 2건 이상 신고된 댓글은 높은 우선순위로 표시됩니다
            </p>
        `
        
        // 6. 알림 발송
        await sendAdminNotification({
            subject: `[세이프티] 미처리 신고 ${reports.length}건 (긴급 ${urgentReports.length}건)`,
            html: htmlContent
        })
        
        console.log(`[신고 알림] 발송 완료: 전체 ${reports.length}건, 긴급 ${urgentReports.length}건`)
        
        return { 
            success: true, 
            reportCount: reports.length,
            urgentCount: urgentReports.length
        }
    } catch (error) {
        console.error('[신고 알림] 발송 실패:', error)
        return { success: false, reportCount: 0, urgentCount: 0 }
    }
}
