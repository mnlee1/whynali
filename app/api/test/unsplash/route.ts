/**
 * app/api/test/unsplash/route.ts
 *
 * [테스트 전용] Unsplash 이미지 검색 확인용 API
 * 테스트 후 이 파일 삭제할 것
 *
 * 사용법:
 * GET /api/test/unsplash?issueId=xxx
 * → 해당 이슈 제목으로 Unsplash 검색 → thumbnail_urls 저장 → 결과 반환
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchUnsplashImages } from '@/lib/unsplash'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const issueId = request.nextUrl.searchParams.get('issueId')
    if (!issueId) {
        return NextResponse.json({ error: 'issueId 파라미터가 필요합니다' }, { status: 400 })
    }

    const { data: issue, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .eq('id', issueId)
        .single()

    if (error || !issue) {
        return NextResponse.json({ error: '이슈를 찾을 수 없습니다' }, { status: 404 })
    }

    const result = await fetchUnsplashImages(issue.title, issue.category, true)

    if (result.urls.length > 0) {
        await supabaseAdmin
            .from('issues')
            .update({ thumbnail_urls: result.urls })
            .eq('id', issueId)
    }

    return NextResponse.json({
        issue: { id: issue.id, title: issue.title, category: issue.category },
        debug: {
            keyword: result.keyword,       // Groq가 추출한 키워드 or 카테고리 폴백
            source: result.source,         // 'groq' or 'fallback'
        },
        before: issue.thumbnail_urls,
        after: result.urls,
        saved: result.urls.length > 0,
    })
}
