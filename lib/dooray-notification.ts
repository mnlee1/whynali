/**
 * lib/dooray-notification.ts
 * 
 * Dooray 메신저로 긴급 이슈 알림을 전송하는 유틸리티
 * 
 * 사용 시점:
 * - 화력 30점 이상 + 연예/정치 카테고리 이슈 발생 시
 * - Cron으로 1시간마다 배치 전송
 */

interface DoorayAttachment {
    title: string
    text: string
    color?: 'red' | 'orange' | 'yellow' | 'green'
}

interface DoorayMessage {
    botName: string
    botIconImage?: string
    text: string
    attachments?: DoorayAttachment[]
}

interface UrgentIssue {
    id: string
    title: string
    category: string
    heat_index: number | null
    created_at: string
}

/**
 * Dooray 메신저로 긴급 이슈 알림 전송
 */
export async function sendDoorayUrgentAlert(issues: UrgentIssue[]): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (issues.length === 0) {
        console.log('[Dooray] 긴급 이슈가 없어 알림을 건너뜁니다.')
        return false
    }

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `🚨 **즉시 처리 필요한 이슈 ${issues.length}건**\n\n관리자 확인이 필요합니다.`,
            attachments: issues.map(issue => ({
                title: issue.title,
                text: `화력: ${issue.heat_index || 0}점 | 카테고리: ${issue.category}`,
                color: (issue.heat_index || 0) >= 50 ? 'red' : 'orange'
            }))
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 긴급 이슈 ${issues.length}건 알림 전송 완료`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 알림 전송 실패:', error)
        return false
    }
}

/**
 * 단일 이슈 즉시 알림 (이슈 등록 시점)
 */
export async function sendDoorayImmediateAlert(issue: UrgentIssue): Promise<boolean> {
    return sendDoorayUrgentAlert([issue])
}

/* ── 신고 알림 전용 ── */

export interface UrgentReport {
    commentId: string
    commentBody: string
    reason: string
    reportCount: number
    context: string
    contextUrl: string
}

/**
 * 긴급 신고 Dooray 즉시 알림 (욕설/혐오 전용)
 */
export async function sendDoorayUrgentReport(report: UrgentReport): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    try {
        const message: DoorayMessage = {
            botName: '왜난리 신고봇',
            text: `🚨 **긴급 신고 알림**\n\n욕설/혐오 댓글이 신고되었습니다. 즉시 확인이 필요합니다.`,
            attachments: [{
                title: `${report.reason} ${report.reportCount}건`,
                text: `위치: ${report.context}\n내용: ${report.commentBody.slice(0, 100)}${report.commentBody.length > 100 ? '...' : ''}\n\n[즉시 처리하기](${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety) | [원문 보기](${report.contextUrl})`,
                color: 'red'
            }]
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 긴급 신고 알림 전송 완료`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 긴급 신고 알림 전송 실패:', error)
        return false
    }
}

export interface PendingReportsSummary {
    totalCount: number
    reasonCounts: Record<string, number>
}

/**
 * 미처리 신고 Dooray 배치 알림 (매일 12시)
 */
export async function sendDoorayPendingReports(summary: PendingReportsSummary): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (summary.totalCount === 0) {
        console.log('[Dooray] 미처리 신고가 없어 알림을 건너뜁니다.')
        return false
    }

    try {
        const reasonText = Object.entries(summary.reasonCounts)
            .map(([reason, count]) => `• ${reason}: ${count}건`)
            .join('\n')

        const message: DoorayMessage = {
            botName: '왜난리 신고봇',
            text: `📋 **미처리 신고 ${summary.totalCount}건**\n\n처리 대기 중인 신고가 있습니다.`,
            attachments: [{
                title: '사유별 현황',
                text: `${reasonText}\n\n[신고 목록 확인하기](${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety)`,
                color: 'orange'
            }]
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 미처리 신고 배치 알림 전송 완료`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 미처리 신고 알림 전송 실패:', error)
        return false
    }
}
