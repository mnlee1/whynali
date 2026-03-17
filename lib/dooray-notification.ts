/**
 * lib/dooray-notification.ts
 *
 * Dooray 메신저로 관리자 알림을 전송하는 유틸리티
 *
 * 알림 유형:
 * 1. sendDoorayUrgentAlert      — 연예/정치 + 화력 30 이상 이슈 즉시 알림
 * 2. sendDoorayBatchGenerationAlert — 토론/투표 배치 자동생성 완료 알림 (매일 12시)
 * 3. sendDoorayReportAlert      — 댓글 신고 임계치 도달 알림
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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `🚨 **관리자 승인 필요 — ${issues.length}건**\n\n연예/정치 카테고리 고화력 이슈입니다. 관리자 페이지에서 승인 처리해 주세요.\n👉 ${siteUrl}/admin/issues`,
            attachments: issues.map(issue => ({
                title: issue.title,
                text: `화력: ${issue.heat_index || 0}점 | 카테고리: ${issue.category} | 승인 대기 중`,
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

interface BatchGenerationResult {
    discussionGenerated: number
    voteGenerated: number
    issueCount: number
}

/**
 * 토론/투표 배치 자동생성 완료 알림 — 매일 12시 cron 완료 후 1회 전송
 */
export async function sendDoorayBatchGenerationAlert(result: BatchGenerationResult): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (result.discussionGenerated === 0 && result.voteGenerated === 0) {
        console.log('[Dooray] 생성된 토론/투표가 없어 알림을 건너뜁니다.')
        return false
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    try {
        const attachments: DoorayAttachment[] = []
        if (result.discussionGenerated > 0) {
            attachments.push({
                title: `토론 주제 ${result.discussionGenerated}건 생성됨`,
                text: `승인 대기 중 → ${siteUrl}/admin/discussions`,
                color: 'yellow',
            })
        }
        if (result.voteGenerated > 0) {
            attachments.push({
                title: `투표 ${result.voteGenerated}건 생성됨`,
                text: `승인 대기 중 → ${siteUrl}/admin/votes`,
                color: 'yellow',
            })
        }

        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `📋 **토론/투표 자동생성 완료 — 승인 처리 필요**\n${result.issueCount}개 이슈에 대해 AI가 콘텐츠를 생성했습니다.`,
            attachments,
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log('[Dooray] ✅ 배치 생성 알림 전송 완료')
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 배치 생성 알림 전송 실패:', error)
        return false
    }
}

interface ReportedComment {
    commentId: string
    body: string
    reason: string
    hateReportCount: number
    autoHidden: boolean
    /** 'issue' | 'discussion' */
    contextType: string
    contextId: string
}

/**
 * 욕설/혐오 신고 즉시 알림
 * - 1건: 알림만 (댓글 유지)
 * - 2건 이상: 자동 숨김 처리 + 알림
 */
export async function sendDoorayReportAlert(report: ReportedComment): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    const preview = report.body.length > 60 ? report.body.slice(0, 60) + '…' : report.body
    const contextLabel = report.contextType === 'discussion' ? '토론 의견' : '댓글'
    const safetyUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety`
    const statusText = report.autoHidden ? '자동 임시 숨김 처리됨' : '노출 중 — 검토 후 처리 필요'

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: report.autoHidden
                ? `🚨 **욕설/혐오 ${report.hateReportCount}건 — 자동 숨김 처리됨**\n${contextLabel}이 임시 숨김 처리되었습니다. 확인 후 영구 삭제 또는 복원해 주세요.\n👉 ${safetyUrl}`
                : `🚨 **욕설/혐오 신고 1건 — 즉시 검토 필요**\n${contextLabel}에 욕설/혐오 신고가 접수되었습니다.\n👉 ${safetyUrl}`,
            attachments: [
                {
                    title: '신고 내용 미리보기',
                    text: [
                        `내용: ${preview}`,
                        `욕설/혐오 신고: ${report.hateReportCount}건`,
                        `상태: ${statusText}`,
                    ].join(' | '),
                    color: 'red',
                },
            ],
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 욕설/혐오 신고 알림 전송 완료 (commentId: ${report.commentId})`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 신고 알림 전송 실패:', error)
        return false
    }
}

interface BatchReportItem {
    commentId: string
    body: string
    reason: string
    reportCount: number
    contextType: string
}

interface DailyReportSummary {
    priority: BatchReportItem[]   // 🟡 우선 검토
    normal: BatchReportItem[]     // 🟢 일반 검토
    low: BatchReportItem[]        // ⚪ 낮은 우선순위
}

/**
 * 신고 일일 배치 알림 — 매일 12시 cron에서 전송
 * 스팸/광고·허위정보·기타 신고 건 요약
 */
export async function sendDoorayDailyReportSummary(summary: DailyReportSummary): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    const totalCount = summary.priority.length + summary.normal.length + summary.low.length
    if (totalCount === 0) {
        console.log('[Dooray] 신고 배치 알림: 처리 대상 없음')
        return false
    }

    const safetyUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety`

    const formatItem = (item: BatchReportItem) => {
        const preview = item.body.length > 40 ? item.body.slice(0, 40) + '…' : item.body
        const label = item.contextType === 'discussion' ? '토론' : '댓글'
        return `[${label}] ${preview} (${item.reason} ${item.reportCount}건)`
    }

    try {
        const attachments: DoorayAttachment[] = []

        if (summary.priority.length > 0) {
            attachments.push({
                title: `🟡 우선 검토 — ${summary.priority.length}건`,
                text: summary.priority.map(formatItem).join('\n'),
                color: 'orange',
            })
        }
        if (summary.normal.length > 0) {
            attachments.push({
                title: `🟢 일반 검토 — ${summary.normal.length}건`,
                text: summary.normal.map(formatItem).join('\n'),
                color: 'yellow',
            })
        }
        if (summary.low.length > 0) {
            attachments.push({
                title: `⚪ 낮은 우선순위 — ${summary.low.length}건`,
                text: summary.low.map(formatItem).join('\n'),
                color: 'green',
            })
        }

        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `📋 **신고 일일 현황 — 총 ${totalCount}건**\n욕설/혐오 외 신고 요약입니다. 관리자 페이지에서 처리해 주세요.\n👉 ${safetyUrl}`,
            attachments,
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 신고 일일 배치 알림 전송 완료 (${totalCount}건)`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 신고 배치 알림 전송 실패:', error)
        return false
    }
}
