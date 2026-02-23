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
            .select('id, source, created_at')
            .order('created_at', { ascending: false })
            .limit(1000)

        const newsByCategory: Record<string, number> = {}
        const newsLast24h: Record<string, number> = {}
        const now = new Date()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        newsData?.forEach((item) => {
            newsByCategory[item.source] = (newsByCategory[item.source] || 0) + 1
            
            const createdAt = new Date(item.created_at)
            if (createdAt > yesterday) {
                newsLast24h[item.source] = (newsLast24h[item.source] || 0) + 1
            }
        })

        // 커뮤니티 통계 — created_at(수집 등록시간) 기준
        const { data: communityData } = await supabaseAdmin
            .from('community_data')
            .select('id, source_site, created_at')
            .order('created_at', { ascending: false })
            .limit(1000)

        const communityBySite: Record<string, number> = {}
        const communityLast24h: Record<string, number> = {}

        communityData?.forEach((item) => {
            communityBySite[item.source_site] = (communityBySite[item.source_site] || 0) + 1
            
            const createdAt = new Date(item.created_at)
            if (createdAt > yesterday) {
                communityLast24h[item.source_site] = (communityLast24h[item.source_site] || 0) + 1
            }
        })

        // 최근 뉴스 10개 (link + 이슈 연결 포함)
        const { data: recentNews } = await supabaseAdmin
            .from('news_data')
            .select('id, title, link, source, published_at, created_at, issue_id, issues(id, title)')
            .order('created_at', { ascending: false })
            .limit(10)

        // 더쿠·네이트판 각각 최근 10건 — 동시 배치 insert 시 한 사이트만 표시되는 문제 방지
        const [{ data: recentTheqoo }, { data: recentNatePann }] = await Promise.all([
            supabaseAdmin
                .from('community_data')
                .select('id, title, source_site, view_count, comment_count, written_at, url, issue_id, issues(id, title)')
                .eq('source_site', '더쿠')
                .order('created_at', { ascending: false })
                .limit(10),
            supabaseAdmin
                .from('community_data')
                .select('id, title, source_site, view_count, comment_count, written_at, url, issue_id, issues(id, title)')
                .eq('source_site', '네이트판')
                .order('created_at', { ascending: false })
                .limit(10),
        ])

        /* 두 목록을 created_at 내림차순으로 병합 */
        const recentCommunity = [...(recentTheqoo || []), ...(recentNatePann || [])]
            .sort((a, b) => new Date(b.written_at).getTime() - new Date(a.written_at).getTime())

        // 연결 통계: news_data / community_data의 issue_id FK 기준
        const { count: linkedNewsCount } = await supabaseAdmin
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .not('issue_id', 'is', null)

        const { count: linkedCommunityCount } = await supabaseAdmin
            .from('community_data')
            .select('*', { count: 'exact', head: true })
            .not('issue_id', 'is', null)

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
