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
import { sendDoorayBatchGenerationAlert, sendDoorayDailyReportSummary, sendDoorayShortformBatchAlert } from '@/lib/dooray-notification'
import { SHORTFORM_ENABLED, SHORTFORM_MIN_HEAT, SHORTFORM_COOLDOWN_HOURS, SHORTFORM_VIDEO_DURATION, SHORTFORM_VIDEO_EFFECT } from '@/lib/config/shortform-thresholds'
import type { ShortformSourceCount } from '@/types/shortform'
import { generateShortformImage } from '@/lib/shortform/generate-image'
import { validateShortformImage } from '@/lib/shortform/ai-validate'
import { convertImageToVideo } from '@/lib/shortform/image-to-video'

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

    const cooldownStart = new Date()
    cooldownStart.setHours(cooldownStart.getHours() - SHORTFORM_COOLDOWN_HOURS)

    const { data: issues, error: issuesError } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, status, heat_index')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .gte('heat_index', SHORTFORM_MIN_HEAT)
        .order('heat_index', { ascending: false })

    if (issuesError || !issues) {
        console.error('[숏폼 배치] 이슈 조회 실패:', issuesError)
        return { jobsGenerated: 0, issueCount: 0 }
    }

    let jobsGenerated = 0

    for (const issue of issues) {
        const { count: recentJobCount, error: recentJobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)
            .in('approval_status', ['pending', 'approved'])
            .gte('created_at', cooldownStart.toISOString())

        if (recentJobError) {
            console.error(`[숏폼 배치] 최근 job 조회 실패 (${issue.id}):`, recentJobError)
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

            // 이미지 자동 생성 + AI 판별
            try {
                await autoGenerateAndValidate(job.id, issue)
            } catch (e) {
                console.error(`  ✗ [숏폼 이미지/AI 판별 실패] "${issue.title}":`, e)
                // 실패해도 job은 유지
            }
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

    // 작업 3: 숏폼 일일 배치
    const shortformResult = await generateShortformBatch()
    if (shortformResult.jobsGenerated > 0) {
        await sendDoorayShortformBatchAlert(shortformResult)
    }

    return NextResponse.json({
        success: true,
        discussionGenerated,
        voteGenerated,
        issueCount: targets.length,
        shortformGenerated: shortformResult.jobsGenerated,
        shortformIssueCount: shortformResult.issueCount,
    })
}

/**
 * 숏폼 이미지 생성 → 동영상 변환 → AI 판별
 * 
 * @param jobId - 생성된 job ID
 * @param issue - 이슈 정보 (category 포함)
 */
async function autoGenerateAndValidate(
    jobId: string,
    issue: { id: string; title: string; category: string | null; heat_index: number | null; status: string }
): Promise<void> {
    // 1. job 상세 조회
    const { data: job } = await supabaseAdmin
        .from('shortform_jobs')
        .select('issue_status, heat_grade, source_count, issue_url, issue_title')
        .eq('id', jobId)
        .single()
    
    if (!job) throw new Error('job 조회 실패')

    // 2. 이미지 생성 (Gemini 텍스트 포함)
    const imageBuffer = await generateShortformImage({
        issueTitle: job.issue_title,
        issueCategory: issue.category ?? '사회',
        issueStatus: job.issue_status,
        heatGrade: job.heat_grade,
        newsCount: (job.source_count as any)?.news ?? 0,
        communityCount: (job.source_count as any)?.community ?? 0,
        issueUrl: job.issue_url,
    })

    // 3. 이미지 → 동영상 변환 (FFmpeg)
    const videoBuffer = await convertImageToVideo(imageBuffer, {
        duration: SHORTFORM_VIDEO_DURATION,
        effect: SHORTFORM_VIDEO_EFFECT,
    })

    // 4. 동영상을 Supabase Storage에 업로드
    await supabaseAdmin.storage
        .from('shortform-assets')
        .upload(`videos/${jobId}.mp4`, videoBuffer, {
            contentType: 'video/mp4',
            upsert: true,
        })

    const { data: { publicUrl } } = supabaseAdmin.storage
        .from('shortform-assets')
        .getPublicUrl(`videos/${jobId}.mp4`)

    // 5. video_path 업데이트
    await supabaseAdmin
        .from('shortform_jobs')
        .update({ video_path: publicUrl })
        .eq('id', jobId)

    console.log(`  ✓ [동영상 생성] "${job.issue_title}" — ${publicUrl}`)

    // 6. AI 이미지 판별 (GEMINI_API_KEY 없으면 스킵)
    // 주의: 동영상이 아닌 이미지를 검수합니다 (텍스트 가독성 검증을 위해)
    if (process.env.GEMINI_API_KEY) {
        const imagePath = `images/${jobId}.png`
        await supabaseAdmin.storage
            .from('shortform-assets')
            .upload(imagePath, imageBuffer, {
                contentType: 'image/png',
                upsert: true,
            })

        const { data: { publicUrl: imageUrl } } = supabaseAdmin.storage
            .from('shortform-assets')
            .getPublicUrl(imagePath)

        const validation = await validateShortformImage(imageUrl, job.issue_title)
        await supabaseAdmin
            .from('shortform_jobs')
            .update({ ai_validation: validation })
            .eq('id', jobId)
        console.log(`  ✓ [AI 판별] "${job.issue_title}" — ${validation.status}`)
    }
}
