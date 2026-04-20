import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        // 1. timeline_points에서 사용된 source_url과 title 가져오기
        const { data: timelinePoints, error: timelineError } = await supabaseAdmin
            .from('timeline_points')
            .select('source_url, title')
            .eq('issue_id', id)

        if (timelineError) throw timelineError

        const usedUrls = (timelinePoints ?? [])
            .map(p => p.source_url)
            .filter(Boolean)
        
        const usedTitles = (timelinePoints ?? [])
            .map(p => p.title)
            .filter(Boolean)

        // 2. 타임라인에 사용된 뉴스만 조회 (제목으로 매칭)
        let newsResult
        if (usedTitles.length > 0) {
            newsResult = await supabaseAdmin
                .from('news_data')
                .select('id, title, link, source, published_at, created_at')
                .eq('issue_id', id)
                .in('title', usedTitles)
                .order('published_at', { ascending: false })
        } else {
            newsResult = { data: [], error: null }
        }

        // 3. Fallback: 매칭된 뉴스가 없으면 전체 news_data 반환
        if (!newsResult.data || newsResult.data.length === 0) {
            newsResult = await supabaseAdmin
                .from('news_data')
                .select('id, title, link, source, published_at, created_at')
                .eq('issue_id', id)
                .order('published_at', { ascending: false })
        }

        const communityResult = await supabaseAdmin
            .from('community_data')
            .select('id, title, url, view_count, comment_count, written_at, source_site, created_at')
            .eq('issue_id', id)
            .order('written_at', { ascending: false })

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
