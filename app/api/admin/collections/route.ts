/**
 * app/api/admin/collections/route.ts
 * 
 * [관리자 - 수집 현황 API]
 * 
 * 뉴스·커뮤니티 수집 통계와 최근 데이터를 조회합니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        // 뉴스 통계
        const { data: newsData } = await supabaseAdmin
            .from('news_data')
            .select('id, category, created_at')
            .order('created_at', { ascending: false })
            .limit(1000)

        const newsByCategory: Record<string, number> = {}
        const newsLast24h: Record<string, number> = {}
        const now = new Date()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        newsData?.forEach((item) => {
            newsByCategory[item.category] = (newsByCategory[item.category] || 0) + 1
            
            const createdAt = new Date(item.created_at)
            if (createdAt > yesterday) {
                newsLast24h[item.category] = (newsLast24h[item.category] || 0) + 1
            }
        })

        // 커뮤니티 통계
        const { data: communityData } = await supabaseAdmin
            .from('community_data')
            .select('id, site, scraped_at')
            .order('scraped_at', { ascending: false })
            .limit(1000)

        const communityBySite: Record<string, number> = {}
        const communityLast24h: Record<string, number> = {}

        communityData?.forEach((item) => {
            communityBySite[item.site] = (communityBySite[item.site] || 0) + 1
            
            const scrapedAt = new Date(item.scraped_at)
            if (scrapedAt > yesterday) {
                communityLast24h[item.site] = (communityLast24h[item.site] || 0) + 1
            }
        })

        // 최근 뉴스 10개
        const { data: recentNews } = await supabaseAdmin
            .from('news_data')
            .select('id, title, source, category, published_at, created_at')
            .order('created_at', { ascending: false })
            .limit(10)

        // 최근 커뮤니티 10개
        const { data: recentCommunity } = await supabaseAdmin
            .from('community_data')
            .select('id, title, site, view_count, comment_count, scraped_at')
            .order('scraped_at', { ascending: false })
            .limit(10)

        // 연결 통계
        const { data: linkedNews, count: linkedNewsCount } = await supabaseAdmin
            .from('source_links')
            .select('*', { count: 'exact', head: true })
            .eq('source_type', 'news')

        const { data: linkedCommunity, count: linkedCommunityCount } = await supabaseAdmin
            .from('source_links')
            .select('*', { count: 'exact', head: true })
            .eq('source_type', 'community')

        return NextResponse.json({
            news: {
                total: newsData?.length || 0,
                byCategory: newsByCategory,
                last24h: newsLast24h,
                linked: linkedNewsCount || 0,
                recent: recentNews || [],
            },
            community: {
                total: communityData?.length || 0,
                bySite: communityBySite,
                last24h: communityLast24h,
                linked: linkedCommunityCount || 0,
                recent: recentCommunity || [],
            },
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('수집 현황 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '수집 현황 조회 실패' },
            { status: 500 }
        )
    }
}
