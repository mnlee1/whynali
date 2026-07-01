import { supabaseAdmin } from '@/lib/supabase-server'
import { sanitizeText } from '@/lib/safety'
import { BOT_PERSONAS, BOT_USER_IDS } from './personas'
import { generateBotComment } from './comment-generator'
import { writeAutoOpLog } from '@/lib/auto-op-log'

// 이슈 1개당 최대 봇 댓글 수
const MAX_BOT_COMMENTS_PER_ISSUE = 3
// 배치 1회당 처리할 최대 이슈 수
const MAX_ISSUES_PER_BATCH = 5

// public.users에 봇 계정 rows가 없으면 삽입
export async function ensureBotUsers(): Promise<void> {
    for (const persona of BOT_PERSONAS) {
        await supabaseAdmin.from('users').upsert(
            {
                id: persona.id,
                provider: null,
                provider_id: null,
                display_name: persona.displayName,
                is_internal: true,   // KPI 집계 자동 제외
            },
            { onConflict: 'id', ignoreDuplicates: true }
        )
    }
}

interface BotCommentInfo {
    count: number
    usedPersonaIds: string[]
}

async function getBotCommentInfo(issueId: string): Promise<BotCommentInfo> {
    const { data } = await supabaseAdmin
        .from('comments')
        .select('user_id')
        .eq('issue_id', issueId)
        .in('user_id', BOT_USER_IDS)
        .in('visibility', ['public', 'pending_review'])

    const rows = data ?? []
    return {
        count: rows.length,
        usedPersonaIds: rows.map((r) => r.user_id as string),
    }
}

// 단일 이슈에 봇 댓글 1개 달기. 성공 시 true 반환.
export async function postBotComment(issueId: string): Promise<boolean> {
    await ensureBotUsers()

    const { count, usedPersonaIds } = await getBotCommentInfo(issueId)
    if (count >= MAX_BOT_COMMENTS_PER_ISSUE) return false

    const available = BOT_PERSONAS.filter((p) => !usedPersonaIds.includes(p.id))
    if (available.length === 0) return false

    // 사용 가능한 페르소나 중 랜덤 선택
    const persona = available[Math.floor(Math.random() * available.length)]

    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('title, category, heat_index')
        .eq('id', issueId)
        .single()

    if (!issue) return false

    const body = await generateBotComment(persona, issue)
    if (!body) {
        await writeAutoOpLog({
            job_type: 'bot_comment',
            status: 'failed',
            target_type: 'issue',
            target_id: issueId,
            details: { persona: persona.displayName, persona_type: persona.type, issue_title: issue.title, reason: 'AI 생성 실패' },
        })
        return false
    }

    const sanitized = sanitizeText(body)
    const { error } = await supabaseAdmin.from('comments').insert({
        issue_id: issueId,
        user_id: persona.id,
        body: sanitized,
        visibility: 'public',
    })

    if (error) {
        console.error('[bot-commenter] 댓글 삽입 실패:', error.message)
        await writeAutoOpLog({
            job_type: 'bot_comment',
            status: 'failed',
            target_type: 'issue',
            target_id: issueId,
            details: { persona: persona.displayName, persona_type: persona.type, issue_title: issue.title, reason: error.message },
        })
        return false
    }

    await writeAutoOpLog({
        job_type: 'bot_comment',
        status: 'success',
        target_type: 'issue',
        target_id: issueId,
        details: { persona: persona.displayName, persona_type: persona.type, issue_title: issue.title, comment: sanitized },
    })
    console.log(`[bot-commenter] "${persona.displayName}" → 이슈 ${issueId} 댓글 등록 완료`)
    return true
}

// 배치 실행: 봇 댓글이 적은 활성 이슈에 순차적으로 댓글 달기
export async function runBotCommentBatch(): Promise<{ processed: number; posted: number }> {
    await ensureBotUsers()

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id')
        .eq('approval_status', '승인')
        .in('status', ['점화', '논란중'])
        .order('created_at', { ascending: false })
        .limit(30)

    if (!issues || issues.length === 0) return { processed: 0, posted: 0 }

    // 봇 댓글 여유 있는 이슈 추려내기
    const candidates: string[] = []
    for (const issue of issues) {
        if (candidates.length >= MAX_ISSUES_PER_BATCH) break
        const { count } = await getBotCommentInfo(issue.id)
        if (count < MAX_BOT_COMMENTS_PER_ISSUE) {
            candidates.push(issue.id)
        }
    }

    let posted = 0
    for (const issueId of candidates) {
        const ok = await postBotComment(issueId)
        if (ok) posted++
    }

    await writeAutoOpLog({
        job_type: 'bot_comment_batch',
        status: posted > 0 ? 'success' : 'skipped',
        details: { processed: candidates.length, posted, scanned: issues.length },
    })

    return { processed: candidates.length, posted }
}
