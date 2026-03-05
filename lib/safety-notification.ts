/**
 * lib/safety-notification.ts
 *
 * 세이프티 검토 대기 알림 기능
 * 02_AI기획_판단포인트.md §6.5, §6.6 기준
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { sendAdminEmail } from '@/lib/email'

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
        await sendAdminEmail(
            '세이프티 검토 대기 알림',
            `
                <h2>세이프티 검토 대기 알림</h2>
                <p>검토 대기 중인 댓글이 <strong>${count}건</strong>입니다.</p>
                <p>관리자 페이지에서 확인해 주세요.</p>
                <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/safety">세이프티 관리 페이지로 이동</a></p>
            `
        )
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
