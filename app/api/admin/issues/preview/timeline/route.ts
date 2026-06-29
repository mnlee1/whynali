/**
 * app/api/admin/issues/preview/timeline/route.ts
 *
 * 수동 등록 위저드 Step 2
 * 저장 없이 파이프라인 실행 후 타임라인 미리보기 반환
 *
 * 입력: { keyword, title, searchKeyword, category, topicDescription }
 * 출력: { finalTitle, timeline, commitData }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { tokenize } from '@/lib/candidate/tokenizer'
import {
    filterAndTitleByAI,
    classifyAndSummarizeTimeline,
} from '@/lib/pipeline/issue-pipeline'
import type { TimelineStageName } from '@/lib/pipeline/issue-pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json()
    const keyword: string = (body.keyword ?? '').trim()
    const title: string = (body.title ?? keyword).trim()
    const searchKeyword: string = (body.searchKeyword ?? keyword).trim()
    const category: string = body.category ?? '사회'
    const topicDescription: string | null = body.topicDescription ?? null

    if (!keyword) {
        return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 })
    }

    // 커뮤니티 데이터 재조회 — AI 검색 키워드 기준으로 매칭 (id, created_at 포함 — filterAndTitleByAI에 필요)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const searchKey = searchKeyword || keyword
    const tokens = tokenize(searchKey).filter(t => t.length >= 2)
    const effectiveTokens = tokens.length > 0 ? tokens : [searchKey]

    // 3자 이상 토큰만 OR 검색 — 짧은 일반 단어로 인한 AND 과필터 방지
    const significantTokens = effectiveTokens.filter(t => t.length >= 3)
    const orTokens = significantTokens.length > 0 ? significantTokens : effectiveTokens.slice(0, 1)
    const orFilter = orTokens.map(t => `title.ilike.%${t}%`).join(',')

    const { data: communityPostsData } = await supabaseAdmin
        .from('community_data')
        .select('id, title, source_site, created_at')
        .gte('updated_at', cutoff48h)
        .or(orFilter)
        .order('updated_at', { ascending: false })
        .limit(200)

    const communityPosts = communityPostsData ?? []

    // 뉴스 검색
    let newsItems: Array<{ id: string; title: string; link: string; source: string; published_at: string }> = []
    try {
        newsItems = await searchNaverNewsByKeyword(searchKeyword, category)
    } catch {
        newsItems = await searchNaverNewsByKeyword(keyword, '사회').catch(() => [])
    }

    if (newsItems.length === 0) {
        return NextResponse.json(
            { error: '관련 뉴스가 없습니다. 키워드나 제목을 수정해보세요.' },
            { status: 422 }
        )
    }

    // AI 필터링 — AI 검색 키워드 기준으로 필터링, 관리자 입력 제목은 유지
    const { relevantNewsIds, relevantCommunityIds } = await filterAndTitleByAI(
        searchKey,
        searchKey,
        newsItems,
        communityPosts,
    )

    // 수동 등록: AI 필터링 실패 시 전체 뉴스 폴백 (관리자 판단 존중)
    const finalNewsIds = relevantNewsIds.length > 0
        ? relevantNewsIds
        : newsItems.slice(0, 10).map(n => n.id)

    // 관리자가 입력한 제목을 그대로 사용
    const finalIssueTitle = title

    // 타임라인 분류 + 요약 생성 (저장 없음)
    const relevantNews = newsItems.filter(n => finalNewsIds.includes(n.id))
    const sampledNews = [...relevantNews]
        .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())
        .slice(0, 5)
        .map(n => ({ id: n.id, title: n.title, published_at: n.published_at, link: n.link }))

    const { stageMap, pointSummaries, summaryRows, briefSummary } = await classifyAndSummarizeTimeline(
        finalIssueTitle,
        sampledNews,
        '점화',
    )

    // timeline_points 구성 (commit 시 그대로 DB insert)
    const timelinePoints = sampledNews.map(news => ({
        stage: (stageMap.get(news.id) ?? '전개') as TimelineStageName,
        title: news.title,
        occurred_at: news.published_at,
        source_url: news.link,
        ai_summary: pointSummaries.get(news.id) ?? null,
    }))

    // 프론트 표시용 타임라인
    const timeline = summaryRows.map(row => ({
        stage: row.stage,
        stageTitle: row.stage_title,
        summary: row.summary,
        dateStart: row.date_start,
        dateEnd: row.date_end,
    }))

    // summaryRows가 비면 (뉴스 1건 or AI 실패) timeline_points 기반으로 단순 구성
    if (timeline.length === 0 && timelinePoints.length > 0) {
        const grouped = new Map<string, typeof timelinePoints>()
        for (const p of timelinePoints) {
            if (!grouped.has(p.stage)) grouped.set(p.stage, [])
            grouped.get(p.stage)!.push(p)
        }
        const STAGE_ORDER = ['발단', '전개', '파생', '진정']
        for (const stage of STAGE_ORDER) {
            const pts = grouped.get(stage)
            if (!pts) continue
            timeline.push({
                stage,
                stageTitle: '',
                summary: pts.map(p => p.title).join(' / '),
                dateStart: pts[0].occurred_at,
                dateEnd: pts[pts.length - 1].occurred_at,
            })
        }
    }

    return NextResponse.json({
        finalTitle: finalIssueTitle,
        timeline,
        commitData: {
            communityPostIds: relevantCommunityIds,
            newsIds: finalNewsIds,
            timelinePoints,
            briefSummary: briefSummary ?? null,
            topicDescription,
        },
    })
}
