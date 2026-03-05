/**
 * app/api/admin/collections/route.ts
 * 
 * [관리자 - 수집 현황 API]
 * 
 * 뉴스·커뮤니티 수집 통계와 최근 데이터를 조회합니다.
 * 
 * 최적화: 전체 count는 캐싱된 근사값 사용 (정확도보다 속도 우선)
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

let cachedCounts: { news: number; community: number; timestamp: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const now = new Date()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayIso = yesterday.toISOString()

        let newsTotal = 0
        let communityTotal = 0

        if (cachedCounts && (Date.now() - cachedCounts.timestamp) < CACHE_TTL_MS) {
            newsTotal = cachedCounts.news
            communityTotal = cachedCounts.community
            console.log('[수집 현황] 캐시된 count 사용')
        } else {
            const [{ count: newsTotalCount }, { count: communityTotalCount }] = await Promise.all([
                supabaseAdmin.from('news_data').select('*', { count: 'exact', head: true }),
                supabaseAdmin.from('community_data').select('*', { count: 'exact', head: true }),
            ])
            
            newsTotal = newsTotalCount ?? 0
            communityTotal = communityTotalCount ?? 0
            
            cachedCounts = {
                news: newsTotal,
                community: communityTotal,
                timestamp: Date.now(),
            }
            console.log('[수집 현황] count 캐시 갱신')
        }

        const [
            { data: newsRecent },
            { data: communityRecent },
        ] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('id, source, created_at')
                .gte('created_at', yesterdayIso)
                .order('created_at', { ascending: false }),
            supabaseAdmin
                .from('community_data')
                .select('id, source_site, created_at')
                .gte('created_at', yesterdayIso)
                .order('created_at', { ascending: false }),
        ])

        const newsByCategory: Record<string, number> = {}
        const newsLast24h: Record<string, number> = {}

        newsRecent?.forEach((item) => {
            newsByCategory[item.source] = (newsByCategory[item.source] || 0) + 1
            newsLast24h[item.source] = (newsLast24h[item.source] || 0) + 1
        })

        const communityBySite: Record<string, number> = {}
        const communityLast24h: Record<string, number> = {}

        communityRecent?.forEach((item) => {
            communityBySite[item.source_site] = (communityBySite[item.source_site] || 0) + 1
            communityLast24h[item.source_site] = (communityLast24h[item.source_site] || 0) + 1
        })

        const { data: recentNews } = await supabaseAdmin
            .from('news_data')
            .select('id, title, link, source, published_at, created_at, issue_id, issues(id, title)')
            .order('created_at', { ascending: false })
            .limit(10)

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

        const recentCommunity = [...(recentTheqoo || []), ...(recentNatePann || [])]
            .sort((a, b) => new Date(b.written_at).getTime() - new Date(a.written_at).getTime())

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
                total: newsTotal,
                byCategory: newsByCategory,
                last24h: newsLast24h,
                linked: linkedNewsCount || 0,
                recent: recentNews || [],
            },
            community: {
                total: communityTotal,
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
