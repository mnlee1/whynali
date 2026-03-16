/**
 * lib/safety-notification.ts
 *
 * 세이프티 검토 대기 알림 기능
 * 02_AI기획_판단포인트.md §6.5, §6.6 기준
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'
import { sendDoorayReportAlert } from '@/lib/dooray-notification'

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
        
        // 4. 우선순위 정렬 및 상위 보고서 생성
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
        
        // 5. Dooray 알림 데이터 준비
        const topReports = sortedReports.slice(0, 5).map(r => ({
            reason: r.reason,
            reportCount: r.report_count,
            commentBody: (r.comments as any)?.body ?? '(삭제된 댓글)'
        }))
        
        // 6. Dooray 알림 발송
        const dooraySuccess = await sendDoorayReportAlert({
            reportCount: reports.length,
            urgentCount: urgentReports.length,
            normalCount: normalReports.length,
            topReports
        })
        
        if (dooraySuccess) {
            console.log(`[신고 알림] Dooray 발송 완료: 전체 ${reports.length}건, 긴급 ${urgentReports.length}건`)
        } else {
            console.warn(`[신고 알림] Dooray 발송 실패 (환경변수 확인 필요)`)
        }
        
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
