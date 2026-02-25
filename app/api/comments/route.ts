import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent, checkRateLimit } from '@/lib/safety'
import { toUserMessage } from '@/lib/api-errors'
import { ensurePublicUser } from '@/lib/ensure-user'

/* comment_likes 에서 userId 기준 { commentId → 'like'|'dislike' } 맵 조회 */
async function getUserLikesMap(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    userId: string,
    commentIds: string[]
): Promise<Record<string, 'like' | 'dislike'>> {
    if (commentIds.length === 0) return {}
    const { data } = await admin
        .from('comment_likes')
        .select('comment_id, type')
        .eq('user_id', userId)
        .in('comment_id', commentIds)
    const map: Record<string, 'like' | 'dislike'> = {}
    for (const row of data ?? []) {
        map[row.comment_id] = row.type as 'like' | 'dislike'
    }
    return map
}

/* GET /api/comments?issue_id=&limit=&offset=&sort=latest|likes|dislikes&best=true */
/* GET /api/comments?discussion_topic_id=&limit=&offset=&sort=latest|likes|dislikes */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const issue_id = searchParams.get('issue_id')
    const discussion_topic_id = searchParams.get('discussion_topic_id')
    const limit = Number(searchParams.get('limit') ?? 20)
    const offset = Number(searchParams.get('offset') ?? 0)
    /* sort: latest(기본) | likes(좋아요순) | dislikes(싫어요순) */
    const sort = searchParams.get('sort') ?? 'latest'
    /* best=true: score(좋아요-싫어요) 상위 3개만 반환 (베스트 댓글 영역용) */
    const best = searchParams.get('best') === 'true'

    if (!issue_id && !discussion_topic_id) {
        return NextResponse.json(
            { error: 'issue_id 또는 discussion_topic_id가 필요합니다.' },
            { status: 400 }
        )
    }

    const admin = createSupabaseAdminClient()

    const orderColumn =
        sort === 'likes'    ? 'like_count'    :
        sort === 'dislikes' ? 'dislike_count' :
        'created_at'

    let query = admin
        .from('comments')
        .select('*, users(display_name)', { count: 'exact' })
        .eq('visibility', 'public')
        .is('parent_id', null)
        .order(orderColumn, { ascending: false })

    if (issue_id) {
        query = query.eq('issue_id', issue_id)
    } else {
        query = query.eq('discussion_topic_id', discussion_topic_id!)
    }

    /* 베스트 댓글: score 상위 3개. like_count 내림차순 + dislike_count 오름차순으로 근사 */
    if (best) {
        query = query
            .gt('like_count', 0)
            .order('like_count', { ascending: false })
            .order('dislike_count', { ascending: true })
            .limit(3)
    } else {
        query = query.range(offset, offset + limit - 1)
    }

    const { data: rawData, error, count } = await query

    if (error) {
        return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
    }

    type Row = (typeof rawData)[number] & { users?: { display_name: string | null } | null }
    const baseData = (rawData ?? []).map((row: Row) => {
        const { users, ...comment } = row
        return { ...comment, display_name: users?.display_name ?? null }
    })

    /* 로그인 유저이면 댓글별 좋아요/싫어요 상태 병합 */
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    let userLikes: Record<string, 'like' | 'dislike'> = {}
    if (user) {
        userLikes = await getUserLikesMap(admin, user.id, baseData.map((c) => c.id))
    }

    const data = baseData.map((c) => ({ ...c, userLikeType: userLikes[c.id] ?? null }))

    return NextResponse.json({ data, total: count ?? 0 })
}

/* POST /api/comments */
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    try {
        await ensurePublicUser(supabase, admin, user)
    } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        return NextResponse.json({ error: toUserMessage(msg, 'comment') }, { status: 500 })
    }

    const { allowed, reason: limitReason } = checkRateLimit(user.id)
    if (!allowed) {
        return NextResponse.json({ error: limitReason }, { status: 429 })
    }

    const body = await request.json()
    const { issue_id, discussion_topic_id, parent_id, content } = body

    if (!issue_id && !discussion_topic_id) {
        return NextResponse.json({ error: 'issue_id 또는 discussion_topic_id가 필요합니다.' }, { status: 400 })
    }

    /* DB 금칙어 조회 (실패 시 빈 배열로 폴백 — 하드코딩 금칙어는 항상 적용) */
    const adminClient = createSupabaseAdminClient()
    const { data: dbRules } = await adminClient
        .from('safety_rules')
        .select('value')
        .eq('kind', 'banned_word')
    const dbBannedWords = (dbRules ?? []).map((r: { value: string }) => r.value)

    const { valid, pendingReview, reason } = validateContent(content, 'comment', dbBannedWords)
    if (!valid && !pendingReview) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    if (issue_id) {
        const { data: issue } = await admin.from('issues').select('id').eq('id', issue_id).maybeSingle()
        if (!issue) {
            return NextResponse.json({ error: '해당 이슈를 찾을 수 없습니다.' }, { status: 404 })
        }
    }
    if (discussion_topic_id) {
        const { data: topic } = await admin.from('discussion_topics').select('id').eq('id', discussion_topic_id).maybeSingle()
        if (!topic) {
            return NextResponse.json({ error: '해당 토론 주제를 찾을 수 없습니다.' }, { status: 404 })
        }
    }

    const { data, error } = await admin
        .from('comments')
        .insert({
            issue_id: issue_id ?? null,
            discussion_topic_id: discussion_topic_id ?? null,
            parent_id: parent_id ?? null,
            user_id: user.id,
            body: sanitizeText(content),
            visibility: pendingReview ? 'pending_review' : 'public',
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: toUserMessage(error.message, 'comment') }, { status: 500 })
    }

    if (pendingReview) {
        return NextResponse.json({
            data,
            message: '등록되었습니다. 내용 검토 후 공개되거나 삭제될 수 있습니다.',
            pending: true,
        }, { status: 201 })
    }

    return NextResponse.json({ data }, { status: 201 })
}
