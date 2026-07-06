/**
 * app/api/admin/issues/preview/route.ts
 *
 * 수동 등록 위저드 Step 1
 * - community_data 키워드 매칭
 * - AI 이슈 검증 (제목·카테고리·검색 키워드 생성)
 * - 네이버 뉴스 카운트 (AI searchKeyword 사용)
 * - 예상 화력 계산
 * - 유사 이슈 존재 여부
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { tokenize } from '@/lib/candidate/tokenizer'
import { verifyIssueByAI, samplePostTitles } from '@/lib/pipeline/issue-pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 실제 calculateHeatIndex와 동일한 공식으로 추산
// (view_count, comment_count 기반 — 시간가중치 미적용)
function estimateHeat(
    posts: Array<{ view_count?: number | null; comment_count?: number | null }>,
    newsCount: number
): number {
    let communityHeat = 0
    if (posts.length > 0) {
        const avgViews = posts.reduce((s, p) => s + (p.view_count ?? 0), 0) / posts.length
        const avgComments = posts.reduce((s, p) => s + (p.comment_count ?? 0), 0) / posts.length
        const viewScore = Math.min(100, (avgViews / 5000) * 100)
        const commentScore = Math.min(100, (avgComments / 500) * 100)
        communityHeat = Math.min(100, Math.max(0, Math.round(viewScore * 0.35 + commentScore * 0.45)))
    }

    // 뉴스: 소스 다양성 알 수 없으므로 건수만으로 근사
    const newsCredibility = Math.min(100, Math.max(0, Math.round(
        Math.min(100, newsCount * 2) * 0.4 +
        (Math.min(20, newsCount) / 20 * 100) * 0.6
    )))

    const communityAmp = communityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))

    return Math.round(Math.min(100, Math.max(0, newsCredibility * (0.3 + 0.7 * communityAmp))))
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json()
    const keyword: string = (body.keyword ?? '').trim()

    if (!keyword) {
        return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 })
    }

    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // 커뮤니티 데이터 조회
    const tokens = tokenize(keyword).filter(t => t.length >= 2)
    const effectiveTokens = tokens.length > 0 ? tokens : [keyword]

    // 3자 이상 토큰만 OR 검색 — 짧은 일반 단어("심사","태도")로 인한 AND 과필터 방지
    const significantTokens = effectiveTokens.filter(t => t.length >= 3)
    const orTokens = significantTokens.length > 0 ? significantTokens : effectiveTokens.slice(0, 1)
    const orFilter = orTokens.map(t => `title.ilike.%${t}%`).join(',')

    let communityQuery = supabaseAdmin
        .from('community_data')
        .select('id, title, source_site, view_count, comment_count')
        .gte('updated_at', cutoff48h)
        .or(orFilter)

    const { data: matchingPostsData } = await communityQuery
        .order('updated_at', { ascending: false })
        .limit(200)

    const matchingPosts = matchingPostsData ?? []

    // AI 이슈 검증 (제목·카테고리·검색 키워드 생성)
    const sourceSites = [...new Set(matchingPosts.map(p => p.source_site))]
    const sampleTitles = matchingPosts.length > 0
        ? samplePostTitles(matchingPosts as Array<{ title: string; source_site: string }>)
        : [keyword]

    let aiResult = {
        title: keyword,
        searchKeyword: keyword,
        category: '사회',
        topic: keyword,
        topicDescription: null as string | null,
        isIssue: false,
        confidence: 0,
    }

    try {
        const result = await verifyIssueByAI(keyword, matchingPosts.length, sourceSites, sampleTitles)
        aiResult = {
            title: result.tentativeTitle || keyword,
            searchKeyword: result.searchKeyword || keyword,
            category: result.category,
            topic: result.topic || keyword,
            topicDescription: result.topicDescription || null,
            isIssue: result.isIssue,
            confidence: result.confidence,
        }
    } catch (err) {
        console.warn('[preview/step1] AI 검증 실패, 키워드 그대로 사용:', err)
    }

    // 네이버 뉴스 검색 (AI searchKeyword → 0건이면 원래 키워드로 재시도)
    let newsCount = 0
    let newsItems: Array<{ title: string }> = []
    try {
        let results = await searchNaverNewsByKeyword(aiResult.searchKeyword, aiResult.category)

        // AI searchKeyword로 0건이면 원래 입력 키워드로 재시도
        if (results.length === 0 && aiResult.searchKeyword !== keyword) {
            results = await searchNaverNewsByKeyword(keyword, aiResult.category)
        }

        newsCount = results.length
        newsItems = results.slice(0, 5).map(n => ({ title: n.title }))
    } catch {
        try {
            const results = await searchNaverNewsByKeyword(keyword, '사회')
            newsCount = results.length
            newsItems = results.slice(0, 5).map(n => ({ title: n.title }))
        } catch {
            // 완전 실패 시 0으로 처리
        }
    }

    // 유사 이슈 조회
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
        ai: aiResult,
        estimatedHeat: estimateHeat(matchingPosts, newsCount),
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
