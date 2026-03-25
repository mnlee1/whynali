/**
 * app/api/cron/daily-generate-content/route.ts
 *
 * [Cron - 매일 오후 12시(KST) 실행]
 *
 * 작업 1: 토론/투표 일일 자동생성
 *   - 승인된 이슈 중 heat ≥ 15 + 토론/투표 없는 것
 *   - AI로 토론 주제(3개)·투표(1개) 생성 → approval_status='대기' 저장
 *   - 완료 후 Dooray 알림
 *
 * 작업 2: 신고 일일 배치 알림
 *   - 욕설/혐오 외 신고(스팸·허위정보·기타)를 우선순위별로 분류
 *   - Dooray로 일일 현황 발송
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import type { IssueMetadata as DiscussionMetadata } from '@/lib/ai/discussion-generator'
import type { IssueMetadata as VoteMetadata } from '@/lib/ai/vote-generator'
import { sendDoorayBatchGenerationAlert, sendDoorayDailyReportSummary } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_HEAT = parseInt(process.env.DAILY_GENERATE_MIN_HEAT ?? '15')
// 한 번에 처리할 최대 이슈 수 (Vercel 타임아웃 방지)
const MAX_ISSUES_PER_RUN = parseInt(process.env.DAILY_GENERATE_MAX_ISSUES ?? '5')

function verifyCronRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return false
    return authHeader === `Bearer ${cronSecret}`
}

/**
 * 신고 일일 배치 — 욕설/혐오 외 신고를 우선순위별로 분류해 Dooray 전송
 *
 * 우선순위 기준:
 *   🟡 priority: 스팸/광고 3건+, 허위정보 2건+, 기타 3건+
 *   🟢 normal:   스팸/광고 2건, 허위정보 1건, 기타 2건
 *   ⚪ low:      스팸/광고 1건, 기타 1건
 */
async function sendDailyReportSummary(): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: reports } = await supabaseAdmin
        .from('reports')
        .select('comment_id, reason, comments!inner(id, body, visibility, issue_id, discussion_topic_id)')
        .neq('reason', '욕설/혐오')
        .eq('comments.visibility', 'public')
        .gte('created_at', yesterday)

    if (!reports || reports.length === 0) return

    // comment_id 기준으로 reason별 건수 집계
    type ReportMap = Record<string, { body: string; contextType: string; reasons: Record<string, number> }>
    const commentMap: ReportMap = {}

    for (const r of reports) {
        const comment = r.comments as unknown as { id: string; body: string; visibility: string; issue_id: string | null; discussion_topic_id: string | null }
        if (!commentMap[r.comment_id]) {
            commentMap[r.comment_id] = {
                body: comment.body,
                contextType: comment.discussion_topic_id ? 'discussion' : 'issue',
                reasons: {},
            }
        }
        commentMap[r.comment_id].reasons[r.reason] = (commentMap[r.comment_id].reasons[r.reason] ?? 0) + 1
    }

    const priority = []
    const normal = []
    const low = []

    for (const [commentId, info] of Object.entries(commentMap)) {
        const spam = info.reasons['스팸/광고'] ?? 0
        const false_ = info.reasons['허위정보'] ?? 0
        const etc = info.reasons['기타'] ?? 0
        const totalCount = spam + false_ + etc
        const dominantReason = spam >= false_ && spam >= etc ? '스팸/광고' : false_ >= etc ? '허위정보' : '기타'

        const item = { commentId, body: info.body, reason: dominantReason, reportCount: totalCount, contextType: info.contextType }

        if (spam >= 3 || false_ >= 2 || etc >= 3) {
            priority.push(item)
        } else if (spam === 2 || false_ >= 1 || etc === 2) {
            normal.push(item)
        } else {
            low.push(item)
        }
    }

    await sendDoorayDailyReportSummary({ priority, normal, low })
}

export async function GET(request: NextRequest) {
    if (!verifyCronRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasGroqKey = !!process.env.GROQ_API_KEY
    const canDiscussion = hasGroqKey
    const canVote = hasGroqKey

    if (!canDiscussion && !canVote) {
        console.error('[daily-generate] GROQ_API_KEY 미설정 — 토론/투표 생성 불가. 신고 배치 알림만 처리합니다.')
        await sendDailyReportSummary()
        return NextResponse.json(
            { error: 'AI API 키 없음 (GROQ_API_KEY 필요)', reportNotified: true },
            { status: 500 }
        )
    }

    // 대상 이슈 조회: 승인 + heat ≥ MIN_HEAT + (토론 없음 OR 투표 없음)
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select(`
            id, title, category, status, heat_index,
            discussion_topics!left(id),
            votes!left(id)
        `)
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .gte('heat_index', MIN_HEAT)
        .order('heat_index', { ascending: false })
        .limit(MAX_ISSUES_PER_RUN * 3) // 필터링 여유분

    if (error) {
        console.error('[daily-generate] 이슈 조회 실패:', error)
        return NextResponse.json({ error: '이슈 조회 실패' }, { status: 500 })
    }

    // 토론 또는 투표가 없는 이슈만 필터링
    const targets = (issues ?? [])
        .filter(issue => {
            const hasDiscussion = Array.isArray(issue.discussion_topics) && issue.discussion_topics.length > 0
            const hasVote = Array.isArray(issue.votes) && issue.votes.length > 0
            return !hasDiscussion || !hasVote
        })
        .slice(0, MAX_ISSUES_PER_RUN)

    if (targets.length === 0) {
        console.log('[daily-generate] 생성 대상 이슈 없음')
        return NextResponse.json({ success: true, discussionGenerated: 0, voteGenerated: 0, issueCount: 0 })
    }

    console.log(`[daily-generate] 대상 이슈 ${targets.length}건 처리 시작`)

    let discussionGenerated = 0
    let voteGenerated = 0

    for (const issue of targets) {
        const metadata: DiscussionMetadata & VoteMetadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '사회',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
        }

        const hasDiscussion = Array.isArray(issue.discussion_topics) && issue.discussion_topics.length > 0
        const hasVote = Array.isArray(issue.votes) && issue.votes.length > 0

        // 토론 주제 생성
        if (!hasDiscussion && canDiscussion) {
            try {
                const topics = await generateDiscussionTopics(metadata, 3)
                if (topics.length > 0) {
                    const { error: insertErr } = await supabaseAdmin
                        .from('discussion_topics')
                        .insert(topics.map(t => ({
                            issue_id: issue.id,
                            body: t.content,
                            is_ai_generated: true,
                            approval_status: '대기',
                        })))
                    if (!insertErr) {
                        discussionGenerated += topics.length
                        console.log(`  ✓ [토론] "${issue.title}" — ${topics.length}건 생성`)
                    }
                }
            } catch (e) {
                console.error(`  ✗ [토론 생성 실패] "${issue.title}":`, e)
            }
        }

        // 투표 생성
        if (!hasVote && canVote) {
            try {
                const votes = await generateVoteOptions(metadata, 1)
                if (votes.length > 0) {
                    const vote = votes[0]
                    const { data: newVote, error: voteErr } = await supabaseAdmin
                        .from('votes')
                        .insert({
                            issue_id: issue.id,
                            title: vote.title,
                            phase: '대기',
                            approval_status: '대기',
                        })
                        .select('id')
                        .single()

                    if (!voteErr && newVote) {
                        await supabaseAdmin
                            .from('vote_choices')
                            .insert(vote.choices.map(label => ({
                                vote_id: newVote.id,
                                label,
                            })))
                        voteGenerated += 1
                        console.log(`  ✓ [투표] "${issue.title}" — "${vote.title}"`)
                    }
                }
            } catch (e) {
                console.error(`  ✗ [투표 생성 실패] "${issue.title}":`, e)
            }
        }
    }

    console.log(`[daily-generate] 완료 — 토론 ${discussionGenerated}건, 투표 ${voteGenerated}건`)

    // 작업 1 알림: 토론/투표 생성 결과
    await sendDoorayBatchGenerationAlert({
        discussionGenerated,
        voteGenerated,
        issueCount: targets.length,
    })

    // 작업 2: 신고 일일 배치 알림 (욕설/혐오 외)
    await sendDailyReportSummary()

    return NextResponse.json({
        success: true,
        discussionGenerated,
        voteGenerated,
        issueCount: targets.length,
    })
}
