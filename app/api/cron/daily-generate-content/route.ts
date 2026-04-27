/**
 * app/api/cron/daily-generate-content/route.ts
 *
 * [Cron - 매일 오후 12시(KST) 실행]
 *
 * 작업 0: 대기 상태 콘텐츠 정리
 *   - 3일 이상 대기 중인 투표(phase='대기') 삭제
 *   - 3일 이상 대기 중인 토론 주제(approval_status='대기') 삭제
 *
 * 작업 1: 토론/투표 일일 자동생성
 *   - 승인된 이슈 중 heat ≥ 15 + 토론/투표 없는 것
 *   - AI로 토론 주제(3개)·투표(1개) 생성 → approval_status='대기' 저장
 *   - 완료 후 Dooray 알림
 *
 * 작업 2: 신고 일일 배치 알림
 *   - 욕설/혐오 외 신고(스팸·허위정보·기타)를 우선순위별로 분류
 *   - Dooray로 일일 현황 발송
 *
 * 작업 3: 숏폼 일일 자동생성
 *   - 승인된 이슈 중 heat_index ≥ 30인 전체 대상
 *   - 쿨다운(20시간) 체크하여 중복 생성 방지
 *   - 완료 후 Dooray 알림
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import type { IssueMetadata as DiscussionMetadata } from '@/lib/ai/discussion-generator'
import type { IssueMetadata as VoteMetadata } from '@/lib/ai/vote-generator'
import { sendDoorayBatchGenerationAlert, sendDoorayShortformBatchAlert } from '@/lib/dooray-notification'
import { SHORTFORM_ENABLED, SHORTFORM_MIN_HEAT } from '@/lib/config/shortform-thresholds'
import type { ShortformSourceCount } from '@/types/shortform'

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
 * 화력 지수를 화력 등급으로 변환
 */
function convertHeatGrade(heatIndex: number | null): '높음' | '보통' | '낮음' {
    if (heatIndex === null) return '낮음'
    if (heatIndex >= 60) return '높음'
    if (heatIndex >= 30) return '보통'
    return '낮음'
}

/**
 * 숏폼 일일 배치 — 승인된 이슈 중 heat_index ≥ 30인 전체 대상
 *
 * @returns 생성된 job 수
 */
async function generateShortformBatch(): Promise<{ jobsGenerated: number; issueCount: number }> {
    if (!SHORTFORM_ENABLED) {
        console.log('[숏폼 배치] SHORTFORM_ENABLED=false — 스킵')
        return { jobsGenerated: 0, issueCount: 0 }
    }

    // 한 번에 처리할 최대 숏폼 수 (타임아웃 방지, 기본 1개)
    const SHORTFORM_BATCH_SIZE = parseInt(process.env.SHORTFORM_BATCH_SIZE ?? '1')

    const { data: issues, error: issuesError } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, status, heat_index')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .gte('heat_index', SHORTFORM_MIN_HEAT)
        .order('heat_index', { ascending: false })
        .limit(SHORTFORM_BATCH_SIZE)

    if (issuesError || !issues) {
        console.error('[숏폼 배치] 이슈 조회 실패:', issuesError)
        return { jobsGenerated: 0, issueCount: 0 }
    }

    let jobsGenerated = 0

    for (const issue of issues) {
        // 활성 job(pending/approved) 중복 체크 — 기간 제한 없이 전체 확인
        const { count: recentJobCount, error: recentJobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)
            .in('approval_status', ['pending', 'approved'])

        if (recentJobError) {
            console.error(`[숏폼 배치] 활성 job 조회 실패 (${issue.id}):`, recentJobError)
            continue
        }

        if ((recentJobCount ?? 0) > 0) {
            continue
        }

        const { count: newsCount } = await supabaseAdmin
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        const { count: communityCount } = await supabaseAdmin
            .from('community_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        const sourceCount: ShortformSourceCount = {
            news: newsCount ?? 0,
            community: communityCount ?? 0,
        }

        const heatGrade = convertHeatGrade(issue.heat_index)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'
        const issueUrl = `${siteUrl}/issue/${issue.id}`

        const { data: job, error: insertError } = await supabaseAdmin
            .from('shortform_jobs')
            .insert({
                issue_id: issue.id,
                issue_title: issue.title,
                issue_status: issue.status,
                heat_grade: heatGrade,
                source_count: sourceCount,
                issue_url: issueUrl,
                trigger_type: 'daily_batch',
                approval_status: 'pending',
            })
            .select('id')
            .single()

        if (!insertError && job) {
            jobsGenerated++
            console.log(`  ✓ [숏폼] "${issue.title}" — job 생성 (화력: ${issue.heat_index})`)
            // 영상 생성은 어드민이 이미지 확인 후 직접 진행
        } else {
            console.error(`  ✗ [숏폼 생성 실패] "${issue.title}":`, insertError)
        }
    }

    console.log(`[숏폼 배치] 완료 — ${jobsGenerated}개 job 생성 (대상 이슈: ${issues.length}개)`)
    return { jobsGenerated, issueCount: issues.length }
}

export async function GET(request: NextRequest) {
    if (!verifyCronRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasGroqKey = !!process.env.GROQ_API_KEY
    const canDiscussion = hasGroqKey
    const canVote = hasGroqKey

    if (!canDiscussion && !canVote) {
        console.error('[daily-generate] GROQ_API_KEY 미설정 — 토론/투표 생성 불가.')
        return NextResponse.json(
            { error: 'AI API 키 없음 (GROQ_API_KEY 필요)' },
            { status: 500 }
        )
    }

    /* 작업 0: 3일 이상 대기 중인 투표·토론 주제 정리 */
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const [staleVotesResult, staleDiscussionsResult] = await Promise.all([
        supabaseAdmin
            .from('votes')
            .delete()
            .eq('phase', '대기')
            .neq('approval_status', '반려')
            .lt('created_at', staleThreshold)
            .select('id'),
        supabaseAdmin
            .from('discussion_topics')
            .delete()
            .eq('approval_status', '대기')
            .lt('created_at', staleThreshold)
            .select('id'),
    ])

    const deletedVotes = staleVotesResult.data?.length ?? 0
    const deletedDiscussions = staleDiscussionsResult.data?.length ?? 0
    if (staleVotesResult.error) console.error('[daily-generate] 대기 투표 정리 에러:', staleVotesResult.error)
    if (staleDiscussionsResult.error) console.error('[daily-generate] 대기 토론 정리 에러:', staleDiscussionsResult.error)
    console.log(`[daily-generate] 대기 콘텐츠 정리 — 투표 ${deletedVotes}개, 토론 ${deletedDiscussions}개 삭제`)

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
        console.log('[daily-generate] 토론/투표 생성 대상 이슈 없음 — 숏폼 배치는 계속 진행')
        const shortformResult = await generateShortformBatch()
        if (shortformResult.jobsGenerated > 0) {
            await sendDoorayShortformBatchAlert(shortformResult)
        }
        return NextResponse.json({
            success: true,
            deletedStaleVotes: deletedVotes,
            deletedStaleDiscussions: deletedDiscussions,
            discussionGenerated: 0,
            voteGenerated: 0,
            issueCount: 0,
            shortformGenerated: shortformResult.jobsGenerated,
            shortformIssueCount: shortformResult.issueCount,
        })
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
                            is_ai_generated: true,
                            issue_status_snapshot: issue.status ?? null,
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

    // 작업 2: 숏폼 일일 배치
    const shortformResult = await generateShortformBatch()
    if (shortformResult.jobsGenerated > 0) {
        await sendDoorayShortformBatchAlert(shortformResult)
    }

    return NextResponse.json({
        success: true,
        deletedStaleVotes: deletedVotes,
        deletedStaleDiscussions: deletedDiscussions,
        discussionGenerated,
        voteGenerated,
        issueCount: targets.length,
        shortformGenerated: shortformResult.jobsGenerated,
        shortformIssueCount: shortformResult.issueCount,
    })
}

