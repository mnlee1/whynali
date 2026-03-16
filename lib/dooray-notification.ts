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

/**
 * 신고 댓글 정보 인터페이스
 */
interface ReportSummary {
    reportCount: number
    urgentCount: number
    normalCount: number
    topReports: Array<{
        reason: string
        reportCount: number
        commentBody: string
    }>
}

/**
 * Dooray 메신저로 미처리 신고 알림 전송
 * 매일 낮 12시 배치 알림용
 */
export async function sendDoorayReportAlert(summary: ReportSummary): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (summary.reportCount === 0) {
        console.log('[Dooray] 미처리 신고가 없어 알림을 건너뜁니다.')
        return false
    }

    try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.vercel.app'
        
        let text = `📋 **미처리 신고 ${summary.reportCount}건**\n\n`
        
        if (summary.urgentCount > 0) {
            text += `🔴 긴급 (욕설/혐오): ${summary.urgentCount}건\n`
        }
        if (summary.normalCount > 0) {
            text += `🟡 일반: ${summary.normalCount}건\n`
        }
        
        text += `\n[세이프티 관리](${siteUrl}/admin/safety)에서 검토해주세요.`

        const attachments: DoorayAttachment[] = []
        
        // 긴급 신고가 있으면 강조
        if (summary.urgentCount > 0) {
            attachments.push({
                title: '🔴 긴급 검토 필요',
                text: `욕설/혐오 신고 ${summary.urgentCount}건`,
                color: 'red'
            })
        }
        
        // 상위 3건 미리보기
        const topReportsText = summary.topReports.slice(0, 3).map((r, idx) => {
            const badge = r.reason === '욕설/혐오' ? '🔴' : '🟡'
            const body = r.commentBody.length > 40 ? r.commentBody.substring(0, 40) + '...' : r.commentBody
            const count = r.reportCount >= 2 ? ` (${r.reportCount}건)` : ''
            return `${idx + 1}. ${badge} ${r.reason}${count}: ${body}`
        }).join('\n')
        
        if (topReportsText) {
            attachments.push({
                title: '📌 우선 검토 대상',
                text: topReportsText,
                color: summary.urgentCount > 0 ? 'red' : 'orange'
            })
        }

        const message: DoorayMessage = {
            botName: '왜난리 세이프티봇',
            text,
            attachments
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

        console.log(`[Dooray] ✅ 미처리 신고 ${summary.reportCount}건 알림 전송 완료`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 신고 알림 전송 실패:', error)
        return false
    }
}
