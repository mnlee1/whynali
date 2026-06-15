/**
 * app/api/admin/issues/preview/route.ts
 *
 * 수동 이슈 등록 전 미리보기 — AI 호출 없이 빠르게 현황 조회
 * - community_data 키워드 매칭
 * - 네이버 뉴스 카운트
 * - 유사 이슈 존재 여부
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { tokenize } from '@/lib/candidate/tokenizer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json()
    const keyword: string = (body.keyword ?? '').trim()

    if (!keyword) {
        return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 })
    }

    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // 커뮤니티 데이터 조회: ilike로 DB에서 직접 필터 (JS 2000건 limit 방식 대체)
    const tokens = tokenize(keyword).filter(t => t.length >= 2)
    const effectiveTokens = tokens.length > 0 ? tokens : [keyword]

    let communityQuery = supabaseAdmin
        .from('community_data')
        .select('id, title, source_site, view_count')
        .gte('updated_at', cutoff48h)

    for (const token of effectiveTokens) {
        communityQuery = communityQuery.ilike('title', `%${token}%`)
    }

    const { data: matchingPostsData } = await communityQuery
        .order('updated_at', { ascending: false })
        .limit(200)

    const matchingPosts = matchingPostsData ?? []

    // 네이버 뉴스 카운트
    let newsCount = 0
    let newsItems: Array<{ title: string }> = []
    try {
        const results = await searchNaverNewsByKeyword(keyword, '사회')
        newsCount = results.length
        newsItems = results.slice(0, 5).map(n => ({ title: n.title }))
    } catch {
        // 네이버 API 실패 시 0으로 처리
    }

    // 유사 이슈 조회 (제목에 토큰 포함, 활성 이슈만)
    const primaryToken = tokens[0] ?? keyword
    const { data: similarIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, status, heat_index, approval_status')
        .ilike('title', `%${primaryToken}%`)
        .not('approval_status', 'eq', '반려')
        .not('status', 'eq', '종결')
        .order('created_at', { ascending: false })
        .limit(5)

    return NextResponse.json({
        keyword,
        community: {
            count: matchingPosts.length,
            posts: matchingPosts.slice(0, 5).map(p => ({
                title: p.title,
                source_site: p.source_site,
                view_count: p.view_count,
            })),
        },
        news: {
            count: newsCount,
            items: newsItems,
        },
        similarIssues: (similarIssues ?? []).map(i => ({
            id: i.id,
            title: i.title,
            status: i.status,
            heat_index: i.heat_index,
            approval_status: i.approval_status,
        })),
    })
}
