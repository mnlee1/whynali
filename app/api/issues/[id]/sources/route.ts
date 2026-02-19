import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const [newsResult, communityResult] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('id, title, link, source, published_at, created_at')
                .eq('issue_id', id)
                .order('published_at', { ascending: false }),
            supabaseAdmin
                .from('community_data')
                .select('id, title, url, view_count, comment_count, written_at, source_site, created_at')
                .eq('issue_id', id)
                .order('written_at', { ascending: false }),
        ])

        if (newsResult.error) throw newsResult.error
        if (communityResult.error) throw communityResult.error

        return NextResponse.json({
            news: newsResult.data ?? [],
            community: communityResult.data ?? [],
        })
    } catch (error) {
        console.error('Sources fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '출처 조회 실패' },
            { status: 500 }
        )
    }
}
