/**
 * lib/naver/blog-schedule.ts
 *
 * 네이버 블로그 초안 생성 예약
 *
 * 네이버 블로그 글쓰기 API는 2020년 폐지되어 실제 자동 발행은 불가능하다.
 * 점화→논란중 전환 시점(recalculate-heat 크론)에 호출되어 "예약"만 하고,
 * generate-naver-blog-draft 크론이 예약 시각 도래 후 AI로 초안(제목/본문)만 생성한다.
 * 생성된 초안은 관리자가 이슈 목록에서 복사해 직접 게시한다.
 * blog_post_status가 이미 설정된 이슈는 건너뛰어 중복 예약(초안 재생성)을 방지한다.
 */

import { supabaseAdmin } from '@/lib/supabase-server'

const MIN_DELAY_MINUTES = 5
const MAX_DELAY_MINUTES = 60

export async function scheduleNaverBlogPost(issueId: string): Promise<void> {
    const delayMinutes = MIN_DELAY_MINUTES + Math.random() * (MAX_DELAY_MINUTES - MIN_DELAY_MINUTES)
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
        .from('issues')
        .update({ blog_post_status: 'pending', blog_scheduled_at: scheduledAt })
        .eq('id', issueId)
        .is('blog_post_status', null)
        .select('id')

    if (error) {
        console.error(`[블로그예약] 이슈 ${issueId} 예약 실패:`, error)
        return
    }

    if (data && data.length > 0) {
        console.log(`[블로그예약] 이슈 ${issueId} — ${scheduledAt} 초안 생성 예정`)
    }
}
