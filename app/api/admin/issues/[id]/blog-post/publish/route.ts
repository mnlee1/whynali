/**
 * app/api/admin/issues/[id]/blog-post/publish/route.ts
 *
 * [관리자 - 네이버 블로그 초안 게시완료 처리]
 *
 * 네이버 블로그 글쓰기 API가 없어 관리자가 직접 블로그에 붙여넣어 게시한 뒤
 * 이 API로 게시완료 상태를 기록한다. 실제 게시 URL은 선택 입력.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const body = await request.json().catch(() => ({}))
        const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                blog_post_status: 'published',
                blog_posted_at: new Date().toISOString(),
                blog_post_url: url,
            })
            .eq('id', id)
            .select('id, blog_post_status, blog_posted_at, blog_post_url')
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('블로그 게시완료 처리 에러:', error)
        return NextResponse.json(
            { error: 'PUBLISH_ERROR', message: '게시완료 처리 실패' },
            { status: 500 }
        )
    }
}
