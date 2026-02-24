/**
 * app/api/comments/[id]/like/route.ts
 *
 * 댓글 좋아요/싫어요 토글 API.
 * POST body: { type: 'like' | 'dislike' }
 *   - 같은 type 재클릭 → 취소
 *   - 반대 type 클릭 → 기존 취소 후 새 타입으로 변경
 * 결과로 갱신된 like_count, dislike_count, userType 반환.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

/** comment_likes 집계로 comments 테이블의 카운트를 동기화 */
async function syncCommentCounts(admin: ReturnType<typeof createSupabaseAdminClient>, commentId: string) {
    const { data } = await admin
        .from('comment_likes')
        .select('type')
        .eq('comment_id', commentId)

    const rows = data ?? []
    const likeCount = rows.filter((r) => r.type === 'like').length
    const dislikeCount = rows.filter((r) => r.type === 'dislike').length

    await admin
        .from('comments')
        .update({ like_count: likeCount, dislike_count: dislikeCount })
        .eq('id', commentId)
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: commentId } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const type: 'like' | 'dislike' = body.type
    if (type !== 'like' && type !== 'dislike') {
        return NextResponse.json({ error: 'type은 like 또는 dislike 여야 합니다.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    const { data: existing } = await admin
        .from('comment_likes')
        .select('id, type')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (existing) {
        if (existing.type === type) {
            /* 같은 타입 재클릭 → 취소 */
            await admin.from('comment_likes').delete().eq('id', existing.id)
        } else {
            /* 반대 타입으로 변경 */
            await admin
                .from('comment_likes')
                .update({ type })
                .eq('id', existing.id)
        }
    } else {
        await admin.from('comment_likes').insert({
            comment_id: commentId,
            user_id: user.id,
            type,
        })
    }

    await syncCommentCounts(admin, commentId)

    const { data: comment } = await admin
        .from('comments')
        .select('like_count, dislike_count')
        .eq('id', commentId)
        .single()

    const { data: myLike } = await admin
        .from('comment_likes')
        .select('type')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .maybeSingle()

    return NextResponse.json({
        like_count: comment?.like_count ?? 0,
        dislike_count: comment?.dislike_count ?? 0,
        userType: myLike?.type ?? null,
    })
}
