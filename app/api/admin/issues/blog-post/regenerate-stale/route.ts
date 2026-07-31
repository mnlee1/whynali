/**
 * app/api/admin/issues/blog-post/regenerate-stale/route.ts
 *
 * [관리자 - 네이버 블로그 초안 일괄 재생성]
 *
 * 이미 생성된(ready_to_publish) 초안은 코드/프롬프트가 나중에 바뀌어도 자동으로 안 바뀌고
 * DB에 저장된 내용 그대로 남는다 — 관리자가 개별 이슈마다 "재생성"을 눌러야만 최신 로직으로
 * 다시 만들어진다. 이슈가 많아지면 하나씩 누르기 번거로워서, ready_to_publish 상태인 이슈를
 * 전부 한 번에 pending으로 되돌려 다음 generate-naver-blog-draft 크론 주기부터 순차적으로
 * (크론 자체가 회당 최대 20건 처리하도록 제한돼 있어 API 사용량이 갑자기 몰리지 않는다)
 * 다시 생성되게 한다. 이미 게시 완료(published)된 건은 대상에서 제외.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                blog_post_status: 'pending',
                blog_scheduled_at: new Date().toISOString(),
                blog_post_error: null,
                blog_post_retry_count: 0,
            })
            .eq('blog_post_status', 'ready_to_publish')
            .select('id')

        if (error) throw error

        return NextResponse.json({ count: data?.length ?? 0 })
    } catch (error) {
        console.error('블로그 초안 일괄 재생성 처리 에러:', error)
        return NextResponse.json(
            { error: 'REGENERATE_ALL_ERROR', message: '일괄 재생성 처리 실패' },
            { status: 500 }
        )
    }
}
