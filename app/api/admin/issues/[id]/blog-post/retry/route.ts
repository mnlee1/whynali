/**
 * app/api/admin/issues/[id]/blog-post/retry/route.ts
 *
 * [관리자 - 네이버 블로그 초안 생성 수동 재시도]
 *
 * blog_post_status가 'failed'(3회 재시도 소진) 또는 'skipped'(brief_summary 없어서 건너뜀)로
 * 멈춘 이슈를 관리자가 수동으로 다시 pending 상태로 되돌려 다음 generate-naver-blog-draft
 * 크론 주기에 재시도되게 한다. skipped 재시도는 brief_summary가 여전히 없으면 다시 skipped로
 * 돌아갈 뿐이라, 관리자가 먼저 이슈 미리보기에서 타임라인을 재생성해두는 게 성공률이 높다.
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

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                blog_post_status: 'pending',
                blog_scheduled_at: new Date().toISOString(),
                blog_post_error: null,
                blog_post_retry_count: 0,
            })
            .eq('id', id)
            .in('blog_post_status', ['failed', 'skipped'])
            .select('id, blog_post_status')
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('블로그 초안 재시도 처리 에러:', error)
        return NextResponse.json(
            { error: 'RETRY_ERROR', message: '재시도 처리 실패' },
            { status: 500 }
        )
    }
}
