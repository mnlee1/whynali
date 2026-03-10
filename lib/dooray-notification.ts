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
