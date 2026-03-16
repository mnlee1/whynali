/**
 * lib/safety-notification.ts
 *
 * 세이프티 검토 대기 알림 기능
 * 02_AI기획_판단포인트.md §6.5, §6.6 기준
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'
import { getSafetyBotEnabled } from '@/lib/safety'

const PENDING_THRESHOLD = 10 // 검토 대기 10건 이상 시 알림

/**
 * 검토 대기 댓글 건수 확인 및 알림 발송
 * 댓글/토론 댓글 작성 시 pendingReview=true일 때 호출
 * 세이프티봇이 OFF 상태이면 알림 발송 스킵
 */
export async function checkAndNotifyPendingReview(): Promise<void> {
    try {
        const admin = createSupabaseAdminClient()

        const enabled = await getSafetyBotEnabled(admin)
        if (!enabled) return
        
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
 * 긴급 신고 알림 (욕설/혐오 전용)
 * 쿨다운: 같은 댓글에 대해 1시간 이내 중복 알림 방지
 */
const urgentReportCooldown = new Map<string, number>()
const URGENT_COOLDOWN = 60 * 60 * 1000 // 1시간

export async function notifyUrgentReport(params: {
    commentId: string
    commentBody: string
    reason: string
    reportCount: number
    issueId?: string | null
    discussionTopicId?: string | null
}): Promise<void> {
    try {
        const { commentId, commentBody, reason, reportCount, issueId, discussionTopicId } = params
        
        /* 욕설/혐오만 즉시 알림 */
        if (reason !== '욕설/혐오') return
        
        /* 쿨다운 체크 (1시간) */
        const now = Date.now()
        const lastNotified = urgentReportCooldown.get(commentId) ?? 0
        if (now - lastNotified < URGENT_COOLDOWN) return
        
        urgentReportCooldown.set(commentId, now)
        
        /* 컨텍스트 URL */
        let contextUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety`
        if (issueId) {
            contextUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/issue/${issueId}`
        }
        
        const contextLabel = issueId ? '이슈' : discussionTopicId ? '토론' : '댓글'
        
        /* Dooray 메신저 알림 (우선) */
        const { sendDoorayUrgentReport } = await import('@/lib/dooray-notification')
        await sendDoorayUrgentReport({
            commentId,
            commentBody,
            reason,
            reportCount,
            context: contextLabel,
            contextUrl,
        })
        
        /* 이메일 알림 (백업) */
        await sendAdminNotification({
            subject: `🚨 [긴급] 욕설/혐오 신고 ${reportCount}건`,
            html: `
                <div style="background-color:#dc2626;color:white;padding:16px;border-radius:8px 8px 0 0;">
                    <h2 style="margin:0;font-size:18px;font-weight:600;">긴급 신고 알림</h2>
                </div>
                <div style="background-color:#fff;border:2px solid #dc2626;padding:20px;border-radius:0 0 8px 8px;">
                    <p style="font-size:16px;color:#991b1b;font-weight:600;margin-top:0;">
                        욕설/혐오 댓글이 신고되었습니다. 즉시 확인이 필요합니다.
                    </p>
                    <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
                        <p style="margin:4px 0;"><strong>신고 사유:</strong> <span style="color:#dc2626;font-weight:600;">${reason}</span></p>
                        <p style="margin:4px 0;"><strong>신고 건수:</strong> <span style="color:#dc2626;font-weight:600;">${reportCount}건</span></p>
                        <p style="margin:4px 0;"><strong>위치:</strong> ${contextLabel}</p>
                    </div>
                    <div style="background-color:#f9fafb;padding:12px;border-radius:4px;margin:16px 0;">
                        <p style="margin:0 0 8px 0;font-weight:600;color:#374151;">댓글 내용:</p>
                        <p style="margin:0;color:#1f2937;line-height:1.6;">${commentBody}</p>
                    </div>
                    <p style="text-align:center;margin:24px 0;">
                        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety" 
                           style="display:inline-block;padding:12px 32px;background-color:#dc2626;color:white;text-decoration:none;border-radius:6px;font-weight:600;">
                            즉시 처리하기
                        </a>
                    </p>
                    <p style="text-align:center;margin:12px 0;">
                        <a href="${contextUrl}" style="color:#2563eb;text-decoration:underline;">원문 보기</a>
                    </p>
                </div>
            `,
            text: `긴급 신고 알림\n\n사유: ${reason} (${reportCount}건)\n위치: ${contextLabel}\n내용: ${commentBody}\n\n관리자 페이지: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety`,
        })
    } catch (error) {
        console.error('긴급 신고 알림 발송 실패:', error)
    }
}
