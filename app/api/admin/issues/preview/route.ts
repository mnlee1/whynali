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

function estimateHeat(communityCount: number, newsCount: number): number {
    const communityHeat = Math.min(100, Math.round((communityCount / 15) * 100))
    const newsHeat = Math.min(100, Math.round((newsCount / 20) * 100))
    if (communityCount > 0) {
        return Math.min(100, Math.round(communityHeat * 0.6 + newsHeat * 0.4))
    }
    return Math.min(30, Math.round(newsHeat * 0.3))
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

    // 네이버 뉴스 카운트 (AI searchKeyword 사용)
    let newsCount = 0
    let newsItems: Array<{ title: string }> = []
    try {
        const results = await searchNaverNewsByKeyword(aiResult.searchKeyword, aiResult.category)
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
        estimatedHeat: estimateHeat(matchingPosts.length, newsCount),
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
