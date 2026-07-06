import { supabaseAdmin } from '@/lib/supabase-server'
import { sanitizeText } from '@/lib/safety'
import { BOT_PERSONAS, BOT_USER_IDS, type BotPersona, type PersonaType } from './personas'
import { generateBotComment, generateBotDiscussionComment } from './comment-generator'
import { writeAutoOpLog } from '@/lib/auto-op-log'

// 카테고리별 선호 페르소나 타입 (빈 배열이면 전체 균등 선택)
const CATEGORY_PREFERRED_TYPES: Record<string, PersonaType[]> = {
    '연예':     ['공감형', '궁금형'],
    '스포츠':   ['공감형', '분석형'],
    '정치':     ['분석형', '비판형', '정보형'],
    '경제':     ['분석형', '정보형', '비판형'],
    '사회':     ['공감형', '비판형', '정보형'],
    'IT과학':   ['분석형', '정보형', '궁금형'],
    '생활문화': ['공감형', '정보형', '궁금형'],
    '세계':     ['정보형', '분석형', '궁금형'],
}

// 카테고리에 맞는 페르소나 풀 반환 (해당 타입 없으면 전체 사용)
function pickPersonaByCategory(available: BotPersona[], category?: string | null): BotPersona {
    const preferredTypes = category ? CATEGORY_PREFERRED_TYPES[category] : undefined
    const pool = preferredTypes?.length
        ? available.filter((p) => preferredTypes.includes(p.type))
        : []
    const candidates = pool.length > 0 ? pool : available
    return candidates[Math.floor(Math.random() * candidates.length)]
}

// 확률 제한 — 70% 확률로만 댓글 생성
const BOT_COMMENT_PROBABILITY = 0.7

const MAX_BOT_COMMENTS_PER_ISSUE = 3
const MAX_ISSUES_PER_BATCH = 5
const MAX_BOT_COMMENTS_PER_DISCUSSION = 3
const MAX_DISCUSSIONS_PER_BATCH = 5

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

    // 70% 확률 제한 — 너무 규칙적인 패턴 방지
    if (Math.random() > BOT_COMMENT_PROBABILITY) return false

    const { count, usedPersonaIds } = await getBotCommentInfo(issueId)
    if (count >= MAX_BOT_COMMENTS_PER_ISSUE) return false

    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('title, category, heat_index, approval_status, status')
        .eq('id', issueId)
        .single()

    if (!issue) return false
    if (issue.approval_status !== '승인' || !['점화', '논란중'].includes(issue.status)) return false

    const available = BOT_PERSONAS.filter((p) => !usedPersonaIds.includes(p.id))
    if (available.length === 0) return false

    // 카테고리 선호 타입 기반 페르소나 선택
    const persona = pickPersonaByCategory(available, issue.category)

    const { comment, failReason } = await generateBotComment(persona, issue)
    if (!comment) {
        await writeAutoOpLog({
            job_type: 'bot_comment',
            status: 'failed',
            target_type: 'issue',
            target_id: issueId,
            details: { persona: persona.displayName, persona_type: persona.type, issue_title: issue.title, reason: failReason ?? 'unknown' },
        })
        return false
    }

    const sanitized = sanitizeText(comment)
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

// ── 토론 의견 봇 ─────────────────────────────────────────────

async function getBotDiscussionCommentInfo(topicId: string): Promise<BotCommentInfo> {
    const { data } = await supabaseAdmin
        .from('comments')
        .select('user_id')
        .eq('discussion_topic_id', topicId)
        .in('user_id', BOT_USER_IDS)
        .in('visibility', ['public', 'pending_review'])

    const rows = data ?? []
    return {
        count: rows.length,
        usedPersonaIds: rows.map((r) => r.user_id as string),
    }
}

export async function postBotDiscussionComment(topicId: string): Promise<boolean> {
    await ensureBotUsers()

    // 70% 확률 제한
    if (Math.random() > BOT_COMMENT_PROBABILITY) return false

    const { count, usedPersonaIds } = await getBotDiscussionCommentInfo(topicId)
    if (count >= MAX_BOT_COMMENTS_PER_DISCUSSION) return false

    const { data: topic } = await supabaseAdmin
        .from('discussion_topics')
        .select('body, approval_status, issues(title, category)')
        .eq('id', topicId)
        .single()

    if (!topic) return false
    if (topic.approval_status !== '진행중') return false

    const issueData = topic.issues as unknown as { title: string; category: string } | null

    const available = BOT_PERSONAS.filter((p) => !usedPersonaIds.includes(p.id))
    if (available.length === 0) return false

    // 카테고리 선호 타입 기반 페르소나 선택
    const persona = pickPersonaByCategory(available, issueData?.category)

    const { comment, failReason } = await generateBotDiscussionComment(persona, {
        body: topic.body,
        issue_title: issueData?.title,
        issue_category: issueData?.category,
    })

    if (!comment) {
        await writeAutoOpLog({
            job_type: 'bot_discussion_comment',
            status: 'failed',
            target_type: 'discussion_topic',
            target_id: topicId,
            details: { persona: persona.displayName, persona_type: persona.type, topic_body: topic.body.slice(0, 80), reason: failReason ?? 'unknown' },
        })
        return false
    }

    const sanitized = sanitizeText(comment)
    const { error } = await supabaseAdmin.from('comments').insert({
        discussion_topic_id: topicId,
        user_id: persona.id,
        body: sanitized,
        visibility: 'public',
    })

    if (error) {
        await writeAutoOpLog({
            job_type: 'bot_discussion_comment',
            status: 'failed',
            target_type: 'discussion_topic',
            target_id: topicId,
            details: { persona: persona.displayName, persona_type: persona.type, topic_body: topic.body.slice(0, 80), reason: error.message },
        })
        return false
    }

    await writeAutoOpLog({
        job_type: 'bot_discussion_comment',
        status: 'success',
        target_type: 'discussion_topic',
        target_id: topicId,
        details: { persona: persona.displayName, persona_type: persona.type, topic_body: topic.body.slice(0, 80), comment: sanitized },
    })
    console.log(`[bot-commenter] "${persona.displayName}" → 토론 ${topicId} 의견 등록 완료`)
    return true
}

export async function runBotDiscussionCommentBatch(): Promise<{ processed: number; posted: number }> {
    await ensureBotUsers()

    const { data: topics } = await supabaseAdmin
        .from('discussion_topics')
        .select('id')
        .eq('approval_status', '진행중')
        .order('created_at', { ascending: false })
        .limit(30)

    if (!topics || topics.length === 0) return { processed: 0, posted: 0 }

    const candidates: string[] = []
    for (const topic of topics) {
        if (candidates.length >= MAX_DISCUSSIONS_PER_BATCH) break
        const { count } = await getBotDiscussionCommentInfo(topic.id)
        if (count < MAX_BOT_COMMENTS_PER_DISCUSSION) {
            candidates.push(topic.id)
        }
    }

    let posted = 0
    for (const topicId of candidates) {
        const ok = await postBotDiscussionComment(topicId)
        if (ok) posted++
        await new Promise(r => setTimeout(r, 2000))
    }

    await writeAutoOpLog({
        job_type: 'bot_discussion_batch',
        status: posted > 0 ? 'success' : 'skipped',
        details: { processed: candidates.length, posted, scanned: topics.length },
    })

    return { processed: candidates.length, posted }
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
        await new Promise(r => setTimeout(r, 2000))
    }

    await writeAutoOpLog({
        job_type: 'bot_comment_batch',
        status: posted > 0 ? 'success' : 'skipped',
        details: { processed: candidates.length, posted, scanned: issues.length },
    })

    return { processed: candidates.length, posted }
}
