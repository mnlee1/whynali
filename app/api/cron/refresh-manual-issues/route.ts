/**
 * app/api/cron/refresh-manual-issues/route.ts
 *
 * [수동 등록 이슈 지속 재수집 Cron]
 *
 * 수동 등록 이슈(source_track='manual')는 등록 시점에 뉴스·커뮤니티를 1회만
 * 검색·연결하고 이후로는 갱신되지 않았다. 트랙 A의 중복/파생 감지에 우연히
 * 걸리지 않는 한 새 데이터가 전혀 붙지 않아 화력이 정체·하락하다가 조기
 * 종결되는 문제가 있었다 (2026-07 발견).
 *
 * 이 크론은 활성(점화/논란중) 수동 등록 이슈를 대상으로 원래 검색 키워드로
 * 네이버 뉴스를 재검색하고, 최근 커뮤니티 게시글 중 키워드가 겹치는 글을
 * 재매칭해 연결한다. AI 호출 없이 키워드 겹침만으로 필터링해 비용을 들이지
 * 않는다 (update-timeline Cron의 필터링 방식과 동일).
 *
 * 스케줄: 3시간마다 (vercel.json 참고)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { tokenize } from '@/lib/candidate/tokenizer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH_SIZE = parseInt(process.env.MANUAL_REFRESH_BATCH_SIZE ?? '8')
const COMMUNITY_LOOKBACK_HOURS = 48

function extractKeywords(title: string): Set<string> {
    return new Set(tokenize(title).filter(t => t.length >= 2))
}

function hasKeywordOverlap(title: string, keywords: Set<string>): boolean {
    for (const kw of extractKeywords(title)) {
        if (keywords.has(kw)) return true
    }
    return false
}

async function refreshIssue(issue: { id: string; title: string; category: string | null }): Promise<{
    newsLinked: number
    communityLinked: number
}> {
    const issueKeywords = extractKeywords(issue.title)

    // 원 검색 키워드 재사용 (없으면 이슈 제목으로 폴백)
    const { data: existingNews } = await supabaseAdmin
        .from('news_data')
        .select('search_keyword')
        .eq('issue_id', issue.id)
        .not('search_keyword', 'is', null)
        .limit(1)

    const keyword = existingNews?.[0]?.search_keyword || issue.title

    // 1. 네이버 뉴스 재검색 — upsert(onConflict: link)라 중복 저장 없이 안전
    const newsItems = await searchNaverNewsByKeyword(keyword, issue.category ?? '사회')
    const relevantNewsIds = newsItems
        .filter(n => hasKeywordOverlap(n.title, issueKeywords))
        .map(n => n.id)

    let newsLinked = 0
    if (relevantNewsIds.length > 0) {
        const { data: linked } = await supabaseAdmin
            .from('news_data')
            .update({ issue_id: issue.id })
            .in('id', relevantNewsIds)
            .is('issue_id', null)
            .select('id')
        newsLinked = linked?.length ?? 0
    }

    // 2. 최근 커뮤니티 게시글 재매칭 (미연결 + 최근 48시간)
    const significantTokens = [...issueKeywords].slice(0, 8)
    let communityLinked = 0
    if (significantTokens.length > 0) {
        const cutoff = new Date(Date.now() - COMMUNITY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
        const orFilter = significantTokens.map(t => `title.ilike.%${t}%`).join(',')

        const { data: communityPosts } = await supabaseAdmin
            .from('community_data')
            .select('id, title')
            .is('issue_id', null)
            .gte('updated_at', cutoff)
            .or(orFilter)
            .limit(50)

        const relevantCommunityIds = (communityPosts ?? [])
            .filter(p => hasKeywordOverlap(p.title, issueKeywords))
            .map(p => p.id)

        if (relevantCommunityIds.length > 0) {
            const { data: linked } = await supabaseAdmin
                .from('community_data')
                .update({ issue_id: issue.id })
                .in('id', relevantCommunityIds)
                .is('issue_id', null)
                .select('id')
            communityLinked = linked?.length ?? 0
        }
    }

    return { newsLinked, communityLinked }
}

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const { data: issues, error } = await supabaseAdmin
            .from('issues')
            .select('id, title, category')
            .eq('source_track', 'manual')
            .eq('approval_status', '승인')
            .in('status', ['점화', '논란중'])
            .order('manual_refreshed_at', { ascending: true, nullsFirst: true })
            .limit(BATCH_SIZE)

        if (error) throw error

        if (!issues || issues.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: '대상 이슈 없음' })
        }

        let newsLinkedTotal = 0
        let communityLinkedTotal = 0
        const details: Array<{ issueId: string; title: string; newsLinked: number; communityLinked: number }> = []

        for (const issue of issues) {
            try {
                const { newsLinked, communityLinked } = await refreshIssue(issue)
                newsLinkedTotal += newsLinked
                communityLinkedTotal += communityLinked
                details.push({ issueId: issue.id, title: issue.title, newsLinked, communityLinked })

                console.log(`[수동 이슈 재수집] "${issue.title}" — 뉴스 ${newsLinked}건, 커뮤니티 ${communityLinked}건 추가 연결`)
            } catch (err) {
                console.error(`[수동 이슈 재수집] "${issue.title}" 실패:`, err)
            } finally {
                await supabaseAdmin
                    .from('issues')
                    .update({ manual_refreshed_at: new Date().toISOString() })
                    .eq('id', issue.id)
            }
        }

        return NextResponse.json({
            success: true,
            processed: issues.length,
            newsLinked: newsLinkedTotal,
            communityLinked: communityLinkedTotal,
            details,
        })
    } catch (error) {
        console.error('[수동 이슈 재수집] Cron 에러:', error)
        return NextResponse.json(
            { error: 'MANUAL_REFRESH_ERROR', message: '수동 이슈 재수집 실패' },
            { status: 500 }
        )
    }
}
