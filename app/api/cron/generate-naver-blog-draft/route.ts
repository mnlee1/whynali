/**
 * app/api/cron/generate-naver-blog-draft/route.ts
 *
 * [네이버 블로그 초안 생성 Cron]
 *
 * 네이버 블로그 글쓰기 API는 2020-05-06 폐지되어(광고성 자동포스팅 방지 목적) 자동 발행이 불가능하다.
 * 이 크론은 lib/naver/blog-schedule.ts로 예약된(blog_post_status='pending') 이슈 중
 * 예약 시각이 지난 건을 AI로 초안(제목/본문)만 생성해 DB에 저장한다.
 * 실제 게시는 관리자가 이슈 목록에서 초안을 복사해 네이버 블로그에 직접 붙여넣는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { generateNaverBlogPost } from '@/lib/ai/blog-post-generator'
import { sendDoorayBlogPostFailureAlert } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_RETRY = 3

/**
 * blog_post_status 최종 업데이트 실패 시 'generating' 상태로 영구히 갇히는 걸 방지.
 * 업데이트 자체가 실패하면 pending으로 되돌려 다음 크론 주기에 재시도되게 한다.
 */
async function finalizeBlogPostUpdate(issueId: string, patch: Record<string, unknown>): Promise<boolean> {
    const { error } = await supabaseAdmin.from('issues').update(patch).eq('id', issueId)

    if (error) {
        console.error(`[generate-naver-blog-draft] 이슈 ${issueId} 상태 업데이트 실패, pending으로 복구 시도:`, error)
        const { error: resetError } = await supabaseAdmin
            .from('issues')
            .update({ blog_post_status: 'pending' })
            .eq('id', issueId)
        if (resetError) {
            console.error(`[generate-naver-blog-draft] 이슈 ${issueId} pending 복구도 실패 — 수동 확인 필요:`, resetError)
        }
        return false
    }

    return true
}

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const now = new Date().toISOString()

    const { data: pendingIssues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, status, heat_index, blog_post_retry_count')
        .eq('blog_post_status', 'pending')
        .lte('blog_scheduled_at', now)
        .limit(20) // 물량이 몰려도 한 번에 이만큼만 처리 — 나머지는 다음 10분 주기에 이어서 처리됨

    if (error) {
        console.error('[generate-naver-blog-draft] 대상 조회 실패:', error)
        return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 })
    }

    if (!pendingIssues || pendingIssues.length === 0) {
        return NextResponse.json({ ready: 0, skipped: 0, failed: 0 })
    }

    let ready = 0
    let skipped = 0
    let failed = 0
    const finalFailures: Array<{ id: string; title: string; error: string }> = []

    for (const issue of pendingIssues) {
        // 동시 실행 방지: pending → generating 전환을 원자적으로 선점
        const { data: claimed } = await supabaseAdmin
            .from('issues')
            .update({ blog_post_status: 'generating' })
            .eq('id', issue.id)
            .eq('blog_post_status', 'pending')
            .select('id')

        if (!claimed || claimed.length === 0) continue // 다른 실행이 이미 처리 중

        try {
            const post = await generateNaverBlogPost(issue.id, {
                title: issue.title,
                category: issue.category ?? '사회',
                status: issue.status ?? '점화',
                heat_index: issue.heat_index,
            })

            if (!post) {
                const finalized = await finalizeBlogPostUpdate(issue.id, {
                    blog_post_status: 'skipped',
                    blog_post_error: 'brief_summary 없음 — 정보 부족으로 초안 생성 건너뜀',
                })
                if (finalized) skipped++
                continue
            }

            const finalized = await finalizeBlogPostUpdate(issue.id, {
                blog_post_status: 'ready_to_publish',
                blog_post_title: post.title,
                blog_post_content: post.contents,
                blog_post_tags: post.tags,
                blog_post_error: null,
            })
            if (finalized) {
                ready++
                console.log(`[generate-naver-blog-draft] 이슈 ${issue.id} 초안 생성 완료: ${post.title}`)
            }
        } catch (err) {
            const retryCount = (issue.blog_post_retry_count ?? 0) + 1
            const errorMessage = err instanceof Error ? err.message : String(err)

            if (retryCount >= MAX_RETRY) {
                const finalized = await finalizeBlogPostUpdate(issue.id, {
                    blog_post_status: 'failed',
                    blog_post_error: errorMessage,
                    blog_post_retry_count: retryCount,
                })
                if (finalized) {
                    failed++
                    finalFailures.push({ id: issue.id, title: issue.title, error: errorMessage })
                }
                console.error(`[generate-naver-blog-draft] 이슈 ${issue.id} 최종 실패 (${retryCount}회):`, errorMessage)
            } else {
                await finalizeBlogPostUpdate(issue.id, {
                    blog_post_status: 'pending',
                    blog_post_error: errorMessage,
                    blog_post_retry_count: retryCount,
                })
                console.warn(`[generate-naver-blog-draft] 이슈 ${issue.id} 실패 (${retryCount}/${MAX_RETRY}), 재시도 예정:`, errorMessage)
            }
        }
    }

    if (finalFailures.length > 0) {
        sendDoorayBlogPostFailureAlert(finalFailures).catch(err =>
            console.error('[generate-naver-blog-draft] 실패 알림 전송 오류:', err)
        )
    }

    console.log(`[generate-naver-blog-draft] 처리 완료 — 초안생성 ${ready}, 스킵 ${skipped}, 실패 ${failed}`)
    return NextResponse.json({ ready, skipped, failed })
}
