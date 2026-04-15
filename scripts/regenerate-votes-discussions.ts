/**
 * scripts/regenerate-votes-discussions.ts
 *
 * 실서버 승인된 이슈(점화/논란중)에 대해
 * 투표 1개 + 토론주제 2개를 AI로 일괄 생성하여 DB에 저장한다.
 * 생성된 항목은 모두 '대기' 상태로 저장 — 관리자 승인 후 서비스 노출.
 *
 * 실행 (실서버):
 *   NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx GROQ_API_KEY=xxx \
 *   npx tsx scripts/regenerate-votes-discussions.ts
 *
 * 실행 (로컬 .env.local 기준):
 *   npx tsx --env-file=.env.local scripts/regenerate-votes-discussions.ts
 */

import { supabaseAdmin } from '../lib/supabase/server'
import { generateVoteOptions } from '../lib/ai/vote-generator'
import { generateDiscussionTopics } from '../lib/ai/discussion-generator'

const DELAY_MS = 2500 // Groq 무료 플랜 rate limit 대응 (30 RPM)

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
    console.log('=== 투표·토론주제 일괄 재생성 시작 ===\n')

    // 활성 이슈만 대상 (승인됨 + 점화/논란중)
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, status, heat_index')
        .eq('approval_status', '승인')
        .in('status', ['점화', '논란중'])
        .order('heat_index', { ascending: false })

    if (error) {
        console.error('이슈 조회 실패:', error)
        process.exit(1)
    }

    console.log(`대상 이슈: ${issues?.length ?? 0}개 (점화/논란중)\n`)

    let voteSuccess = 0
    let voteSkip = 0
    let topicSuccess = 0
    let topicSkip = 0

    for (const issue of issues ?? []) {
        console.log(`▶ ${issue.title}`)

        // 관련 뉴스 헤드라인 조회
        const { data: newsData } = await supabaseAdmin
            .from('news_data')
            .select('title')
            .eq('issue_id', issue.id)
            .order('published_at', { ascending: false })
            .limit(5)

        const newsTitles = (newsData ?? []).map(n => n.title).filter(Boolean) as string[]

        if (newsTitles.length === 0) {
            console.log('  ⚠️  연결된 뉴스 없음 — 건너뜀\n')
            voteSkip++
            topicSkip++
            continue
        }

        const metadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '기타',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
            news_titles: newsTitles,
        }

        // ── 투표 생성 ──────────────────────────────
        try {
            const votes = await generateVoteOptions(metadata, 2)

            if (votes.length > 0) {
                const vote = votes[0]
                const { data: savedVote, error: voteErr } = await supabaseAdmin
                    .from('votes')
                    .insert({
                        issue_id: issue.id,
                        title: vote.title,
                        phase: '대기',
                        approval_status: '대기',
                        issue_status_snapshot: issue.status,
                        is_ai_generated: true,
                    })
                    .select()
                    .single()

                if (voteErr || !savedVote) {
                    console.log(`  ❌ 투표 저장 실패: ${voteErr?.message}`)
                    voteSkip++
                } else {
                    await supabaseAdmin.from('vote_choices').insert(
                        vote.choices.map(label => ({
                            vote_id: savedVote.id,
                            label,
                            count: 0,
                        }))
                    )
                    console.log(`  ✅ 투표: ${vote.title} / [${vote.choices.join(', ')}]`)
                    voteSuccess++
                }
            } else {
                console.log('  ⚠️  투표 생성 결과 없음 (필터 탈락)')
                voteSkip++
            }
        } catch (e) {
            console.error(`  ❌ 투표 생성 오류:`, e instanceof Error ? e.message : e)
            voteSkip++
        }

        await sleep(DELAY_MS)

        // ── 토론주제 생성 ──────────────────────────
        try {
            const topics = await generateDiscussionTopics(metadata, 2)

            if (topics.length > 0) {
                const rows = topics.map(t => ({
                    issue_id: issue.id,
                    body: t.content,
                    is_ai_generated: true,
                    approval_status: '대기',
                }))

                const { error: topicErr } = await supabaseAdmin
                    .from('discussion_topics')
                    .insert(rows)

                if (topicErr) {
                    console.log(`  ❌ 토론주제 저장 실패: ${topicErr.message}`)
                    topicSkip++
                } else {
                    topics.forEach(t => console.log(`  ✅ 토론: ${t.content}`))
                    topicSuccess += topics.length
                }
            } else {
                console.log('  ⚠️  토론주제 생성 결과 없음 (필터 탈락)')
                topicSkip++
            }
        } catch (e) {
            console.error(`  ❌ 토론주제 생성 오류:`, e instanceof Error ? e.message : e)
            topicSkip++
        }

        await sleep(DELAY_MS)
        console.log()
    }

    console.log('=== 완료 ===')
    console.log(`투표  — 생성: ${voteSuccess}개 / 건너뜀: ${voteSkip}개`)
    console.log(`토론  — 생성: ${topicSuccess}개 / 건너뜀: ${topicSkip}개`)
    console.log('\n관리자 페이지에서 대기 항목 검토 후 승인해주세요.')
}

main().catch(e => {
    console.error('스크립트 오류:', e)
    process.exit(1)
})
