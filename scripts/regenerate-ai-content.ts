/**
 * scripts/regenerate-ai-content.ts
 *
 * 실서버 DB의 투표·토론주제를 개선된 프롬프트로 재생성한다.
 *
 * 전략:
 *   투표 0표  → 삭제(vote_choices 포함) 후 새 투표를 "대기"로 생성
 *   투표 1표+ → 기존을 "마감"으로 변경 후 새 투표를 "대기"로 생성
 *   토론 댓글 없음 → 삭제 후 새 주제를 "대기"로 생성
 *   토론 댓글 있음 → 보존 (삭제 시 댓글 소실)
 *
 * 사용법:
 *   npx tsx --env-file=.env.local scripts/regenerate-ai-content.ts          ← 미리보기(dry-run)
 *   npx tsx --env-file=.env.local scripts/regenerate-ai-content.ts --execute ← 실제 실행
 */

import { createClient } from '@supabase/supabase-js'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import type { IssueMetadata } from '@/lib/ai/vote-generator'

const PROD_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PROD_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

const sb = createClient(PROD_URL, PROD_KEY)
const EXECUTE = process.argv.includes('--execute')
const DELAY_MS = 15000 // Groq 무료 TPM 한도(6000) 고려 — 이슈당 투표+토론 두 번 호출

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 이슈 목록 수집 ──────────────────────────────────────────────

async function getTargetIssues() {
    // 투표가 있는 이슈
    const { data: votes } = await sb
        .from('votes')
        .select('issue_id, id, title, phase, vote_choices(count)')
    // 토론주제가 있는 이슈
    const { data: topics } = await sb
        .from('discussion_topics')
        .select('issue_id, id, body, approval_status')
    // 댓글 있는 토론주제 ID
    const { data: comments } = await sb
        .from('comments')
        .select('discussion_topic_id')
        .not('discussion_topic_id', 'is', null)

    const commentedTopicIds = new Set(comments?.map(c => c.discussion_topic_id) ?? [])

    // 이슈 ID 합집합
    const issueIds = [
        ...new Set([
            ...(votes?.map(v => v.issue_id) ?? []),
            ...(topics?.map(t => t.issue_id) ?? []),
        ]),
    ]

    // 이슈 메타데이터 조회
    const { data: issues } = await sb
        .from('issues')
        .select('id, title, category, status, heat_index')
        .in('id', issueIds)

    return { issues: issues ?? [], votes: votes ?? [], topics: topics ?? [], commentedTopicIds }
}

// ── 투표 재생성 ──────────────────────────────────────────────────

async function regenerateVote(
    issue: IssueMetadata & { id: string; title: string },
    existingVotes: Array<{ id: string; title: string; phase: string; vote_choices: Array<{ count: number }> }>
) {
    const totalVotes = existingVotes.reduce(
        (sum, v) => sum + v.vote_choices.reduce((s, c) => s + (c.count || 0), 0),
        0
    )
    const hasVotes = totalVotes > 0

    console.log(`\n  📊 투표 처리: "${issue.title.slice(0, 30)}"`)
    console.log(`     기존: ${existingVotes.length}개 / 총 ${totalVotes}표`)
    console.log(`     전략: ${hasVotes ? '기존 마감 → 새 투표 대기 생성' : '기존 삭제 → 새 투표 대기 생성'}`)

    // 새 투표 생성
    let newVotes
    try {
        newVotes = await generateVoteOptions(issue, 1)
    } catch (e) {
        console.log(`     ❌ AI 생성 실패: ${e instanceof Error ? e.message : e}`)
        return
    }

    if (newVotes.length === 0) {
        console.log('     ⚠️  필터 통과 결과 없음 (재시도 필요)')
        return
    }

    const newVote = newVotes[0]
    console.log(`     ✨ 새 투표: "${newVote.title}"`)
    console.log(`     선택지: ${JSON.stringify(newVote.choices)}`)

    if (!EXECUTE) return

    // 기존 투표 처리
    for (const v of existingVotes) {
        if (hasVotes) {
            // 참여 기록 있음 → 마감으로 변경
            await sb.from('votes').update({ phase: '마감' }).eq('id', v.id)
        } else {
            // 참여 없음 → vote_choices 먼저 삭제 후 vote 삭제
            await sb.from('vote_choices').delete().eq('vote_id', v.id)
            await sb.from('votes').delete().eq('id', v.id)
        }
    }

    // 새 투표 + 선택지 삽입
    const { data: inserted, error } = await sb
        .from('votes')
        .insert({
            issue_id: issue.id,
            title: newVote.title,
            phase: '대기',
            approval_status: '대기',
            is_ai_generated: true,
            issue_status_snapshot: issue.status ?? null,
        })
        .select('id')
        .single()

    if (error || !inserted) {
        console.log(`     ❌ 투표 저장 실패: ${error?.message}`)
        return
    }

    await sb.from('vote_choices').insert(
        newVote.choices.map(label => ({ vote_id: inserted.id, label }))
    )
    console.log('     ✅ 저장 완료')
}

// ── 토론주제 재생성 ───────────────────────────────────────────────

async function regenerateDiscussions(
    issue: IssueMetadata & { id: string; title: string },
    existingTopics: Array<{ id: string; body: string }>,
    commentedTopicIds: Set<string>
) {
    const deletable = existingTopics.filter(t => !commentedTopicIds.has(t.id))
    const preserved = existingTopics.filter(t => commentedTopicIds.has(t.id))

    console.log(`\n  💬 토론주제 처리: "${issue.title.slice(0, 30)}"`)
    console.log(`     기존: ${existingTopics.length}개 / 보존(댓글): ${preserved.length}개 / 삭제대상: ${deletable.length}개`)

    // 새 주제 생성 (삭제할 만큼 보충)
    const genCount = Math.max(3 - preserved.length, 1)
    let newTopics
    try {
        newTopics = await generateDiscussionTopics(issue, genCount + 1) // 필터 탈락 여유
    } catch (e) {
        console.log(`     ❌ AI 생성 실패: ${e instanceof Error ? e.message : e}`)
        return
    }

    if (newTopics.length === 0) {
        console.log('     ⚠️  필터 통과 결과 없음 (재시도 필요)')
        return
    }

    newTopics.slice(0, genCount).forEach((t, i) => console.log(`     ✨ ${i + 1}. "${t.content}"`))

    if (!EXECUTE) return

    // 댓글 없는 기존 주제 삭제
    if (deletable.length > 0) {
        await sb.from('discussion_topics').delete().in('id', deletable.map(t => t.id))
    }

    // 새 주제 삽입 (대기 상태)
    await sb.from('discussion_topics').insert(
        newTopics.slice(0, genCount).map(t => ({
            issue_id: issue.id,
            body: t.content,
            is_ai_generated: true,
            approval_status: '대기',
        }))
    )
    console.log('     ✅ 저장 완료')
}

// ── 메인 ─────────────────────────────────────────────────────────

async function main() {
    console.log('🔄 실서버 AI 콘텐츠 재생성')
    console.log(`모드: ${EXECUTE ? '🔴 실제 실행 (--execute)' : '🟡 미리보기 (dry-run)'}`)
    if (!EXECUTE) console.log('실제 적용하려면: npx tsx --env-file=.env.local scripts/regenerate-ai-content.ts --execute\n')

    const { issues, votes, topics, commentedTopicIds } = await getTargetIssues()
    console.log(`대상 이슈: ${issues.length}개\n`)

    for (const issue of issues) {
        const meta: IssueMetadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '사회',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
        }

        const issueVotes = votes.filter(v => v.issue_id === issue.id)
        const issueTopics = topics.filter(t => t.issue_id === issue.id)

        console.log(`\n${'─'.repeat(60)}`)
        console.log(`📌 ${issue.title}`)

        if (issueVotes.length > 0) {
            await regenerateVote(meta, issueVotes)
        }

        if (issueTopics.length > 0) {
            await regenerateDiscussions(meta, issueTopics, commentedTopicIds)
        }

        console.log(`  ⏳ ${DELAY_MS / 1000}초 대기 (rate limit)...`)
        await wait(DELAY_MS)
    }

    console.log('\n' + '='.repeat(60))
    console.log(EXECUTE ? '✅ 재생성 완료! 어드민에서 대기 항목을 검토·승인해주세요.' : '✅ 미리보기 완료. --execute 플래그로 실제 실행하세요.')
}

main().catch(e => { console.error(e); process.exit(1) })
