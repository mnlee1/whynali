/** lib/email.ts — 관리자 알림 이메일 유틸리티 (Resend 기반) */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/** ADMIN_NOTIFY_EMAILS 환경변수를 파싱해 수신자 목록 반환 */
function getNotifyRecipients(): string[] {
    const raw = process.env.ADMIN_NOTIFY_EMAILS ?? ''
    return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export interface AdminEmailPayload {
    subject: string
    /** HTML 본문 */
    html: string
    /** 플레인 텍스트 fallback (선택) */
    text?: string
}

/**
 * 관리자 알림 이메일을 ADMIN_NOTIFY_EMAILS에 등록된 모든 수신자에게 발송
 * - 수신자가 없거나 RESEND_API_KEY가 없으면 console.warn만 출력하고 종료
 * - 개별 발송 실패 시 전체를 중단하지 않고 계속 진행
 */
export async function sendAdminNotification(payload: AdminEmailPayload): Promise<void> {
    const recipients = getNotifyRecipients()

    if (!process.env.RESEND_API_KEY) {
        console.warn('[email] RESEND_API_KEY 미설정 — 이메일 발송 건너뜀')
        return
    }

    if (recipients.length === 0) {
        console.warn('[email] ADMIN_NOTIFY_EMAILS 미설정 — 이메일 발송 건너뜀')
        return
    }

    const from = process.env.EMAIL_FROM ?? 'whynali <noreply@whynali.com>'

    const results = await Promise.allSettled(
        recipients.map((to) =>
            resend.emails.send({
                from,
                to,
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
            })
        )
    )

    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            console.error(`[email] 발송 실패 (${recipients[i]}):`, result.reason)
        }
    })
}

/* ── 미리 정의된 알림 템플릿 ── */

/** 검토 대기 댓글 발생 알림 */
export function notifyPendingComment(params: {
    commentBody: string
    userId: string
    context: string
}) {
    return sendAdminNotification({
        subject: '[왜난리] 검토 대기 댓글이 등록되었습니다',
        html: `
            <h2>검토 대기 댓글 알림</h2>
            <p><strong>사용자:</strong> ${params.userId}</p>
            <p><strong>위치:</strong> ${params.context}</p>
            <p><strong>내용:</strong></p>
            <blockquote style="border-left:4px solid #e5e7eb;padding:8px 16px;color:#374151;">
                ${params.commentBody}
            </blockquote>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety">관리자 페이지에서 처리하기</a></p>
        `,
        text: `검토 대기 댓글\n사용자: ${params.userId}\n내용: ${params.commentBody}`,
    })
}

/** 새 이슈 승인 대기 알림 */
export function notifyPendingIssue(params: {
    issueTitle: string
    issueId: string
}) {
    return sendAdminNotification({
        subject: `[왜난리] 이슈 승인 대기: ${params.issueTitle}`,
        html: `
            <h2>이슈 승인 대기 알림</h2>
            <p><strong>제목:</strong> ${params.issueTitle}</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/issues">관리자 페이지에서 처리하기</a></p>
        `,
        text: `이슈 승인 대기\n제목: ${params.issueTitle}`,
    })
}
