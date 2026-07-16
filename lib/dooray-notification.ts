/**
 * lib/dooray-notification.ts
 *
 * Dooray 메신저로 관리자 알림을 전송하는 유틸리티
 *
 * 알림 유형:
 * 1. sendDoorayUrgentAlert      — 연예/정치 + 화력 30 이상 이슈 즉시 알림
 * 2. sendDoorayBatchGenerationAlert — 토론/투표 배치 자동생성 완료 알림 (매일 12시)
 * 3. sendDoorayReportAlert      — 댓글 신고 임계치 도달 알림
 * 4. sendDoorayShortformBatchAlert — 숏폼 배치 자동생성 완료 알림 (매일 12시)
 * 5. sendDoorayBlogPostFailureAlert — 네이버 블로그 초안 생성 최종 실패 알림
 * 6. sendDoorayCardNewsQualityGateAlert — 카드뉴스 자동 발행 전 품질 게이트가 막았을 때 알림
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

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
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

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
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
                text: `승인 대기 중 → [${siteUrl}/admin/discussions](${siteUrl}/admin/discussions)`,
                color: 'yellow',
            })
        }
        if (result.voteGenerated > 0) {
            attachments.push({
                title: `투표 ${result.voteGenerated}건 생성됨`,
                text: `승인 대기 중 → [${siteUrl}/admin/votes](${siteUrl}/admin/votes)`,
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

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
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

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
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

interface ShortformBatchResult {
    jobsGenerated: number
    issueCount: number
}

/**
 * 숏폼 배치 자동생성 완료 알림 — 매일 12시 cron 완료 후 1회 전송
 */
export async function sendDoorayShortformBatchAlert(result: ShortformBatchResult): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
        return false
    }

    if (result.jobsGenerated === 0) {
        console.log('[Dooray] 생성된 숏폼 job이 없어 알림을 건너뜁니다.')
        return false
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `🎬 **숏폼 자동생성 완료 — 승인 처리 필요**\n${result.issueCount}개 이슈에 대해 ${result.jobsGenerated}개 숏폼 job이 생성되었습니다.`,
            attachments: [
                {
                    title: `숏폼 job ${result.jobsGenerated}건 생성됨`,
                    text: `승인 대기 중 → ${siteUrl}/admin/shortform`,
                    color: 'yellow',
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

        console.log('[Dooray] ✅ 숏폼 배치 생성 알림 전송 완료')
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 숏폼 배치 생성 알림 전송 실패:', error)
        return false
    }
}

interface BlogPostFailure {
    id: string
    title: string
    error: string
}

/**
 * 네이버 블로그 초안 생성 최종 실패 알림 — generate-naver-blog-draft 크론에서
 * 최대 재시도(3회) 소진 후 실패로 확정된 건이 있을 때 호출
 */
export async function sendDoorayBlogPostFailureAlert(failures: BlogPostFailure[]): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
        return false
    }

    if (failures.length === 0) {
        console.log('[Dooray] 실패한 블로그 포스팅이 없어 알림을 건너뜁니다.')
        return false
    }

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `⚠️ **네이버 블로그 초안 생성 실패 — ${failures.length}건**\n최대 재시도 후에도 실패했습니다. 확인이 필요합니다.`,
            attachments: failures.map(f => ({
                title: f.title,
                text: f.error,
                color: 'red',
            })),
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        })

        if (!response.ok) {
            throw new Error(`Dooray API 오류: ${response.status} ${response.statusText}`)
        }

        console.log(`[Dooray] ✅ 블로그 초안 생성 실패 알림 전송 완료 (${failures.length}건)`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 블로그 초안 생성 실패 알림 전송 실패:', error)
        return false
    }
}

interface CardNewsQualityGateResult {
    mode: string
    issueTitle: string
    fallbackCount: number
    outputDir: string
}

/**
 * 카드뉴스 자동 발행 전 품질 게이트 알림 — 생성 중 폴백(AI 텍스트 검증 실패)이 발생해
 * 자동 발행을 건너뛰었을 때 호출. 사람 검수 단계 없이 자동 발행되는 구조는 그대로 두되,
 * 폴백이 섞인 결과물만 자동으로 발행을 막고 관리자에게 draft 페이지에서 확인하도록 알린다.
 */
export async function sendDoorayCardNewsQualityGateAlert(result: CardNewsQualityGateResult): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
        return false
    }

    // 이 함수는 Vercel이 아니라 GitHub Actions(카드뉴스 cron)에서 호출돼 NEXT_PUBLIC_SITE_URL이
    // 없을 수 있음 — pipeline.ts가 이미 쓰는 고정 도메인으로 대체.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `⚠️ **카드뉴스 자동 발행 보류 — 품질 게이트 작동**\n"${result.issueTitle}" (${result.mode}) 생성 중 검증 실패로 폴백 텍스트가 ${result.fallbackCount}건 섞여 자동 발행을 건너뛰었습니다. 관리자 페이지에서 draft로 수정 후 수동 발행해 주세요.\n👉 ${siteUrl}/admin/card-news`,
            attachments: [
                {
                    title: `폴백 ${result.fallbackCount}건 발생`,
                    text: `모드: ${result.mode} | 이슈: ${result.issueTitle} | 이미지: ${result.outputDir} (CI 아티팩트로 업로드됨)`,
                    color: 'orange',
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

        console.log('[Dooray] ✅ 카드뉴스 품질 게이트 알림 전송 완료')
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 카드뉴스 품질 게이트 알림 전송 실패:', error)
        return false
    }
}

interface CardNewsUploadFailure {
    platform: 'Instagram' | 'Threads'
    mode: string
    issueTitle: string
    error: string
}

/**
 * 카드뉴스 SNS 업로드 실패 알림 — Instagram/Threads 업로드가 실패했을 때 즉시 호출.
 * 액세스 토큰 만료처럼 다음 실행에도 계속 반복될 수 있는 문제를 조용히 넘기지 않고
 * 실패 첫 회차부터 관리자에게 알려, 예전처럼 여러 날 동안 모르고 지나가는 일을 막는다.
 */
export async function sendDoorayCardNewsUploadFailureAlert(failure: CardNewsUploadFailure): Promise<boolean> {
    const webhookUrl = process.env.DOORAY_WEBHOOK_URL

    if (!webhookUrl) {
        console.log('[Dooray] DOORAY_WEBHOOK_URL 환경변수가 설정되지 않아 알림을 건너뜁니다.')
        return false
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dooray] 개발 환경에서는 알림을 전송하지 않습니다.')
        return false
    }

    try {
        const message: DoorayMessage = {
            botName: '왜난리 알림봇',
            text: `🚨 **카드뉴스 ${failure.platform} 업로드 실패**\n"${failure.issueTitle}" (${failure.mode}) 발행 중 ${failure.platform} 업로드가 실패했습니다. 액세스 토큰 만료 등 계정 연동 문제일 수 있으니 확인해 주세요.`,
            attachments: [
                {
                    title: `${failure.platform} 오류`,
                    text: failure.error,
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

        console.log(`[Dooray] ✅ 카드뉴스 ${failure.platform} 업로드 실패 알림 전송 완료`)
        return true
    } catch (error) {
        console.error('[Dooray] ❌ 카드뉴스 업로드 실패 알림 전송 실패:', error)
        return false
    }
}

