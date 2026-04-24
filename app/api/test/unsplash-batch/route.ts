/**
 * app/api/test/unsplash-batch/route.ts
 *
 * [임시] thumbnail_urls 없는 이슈 일괄 Pixabay 이미지 적용
 *
 * 사용법:
 * GET /api/test/pixabay-batch?limit=20
 * → thumbnail_urls 없는 이슈를 최신순으로 limit개 처리
 * → Pixabay 5000회/시간 한도, Groq rate limit 방지를 위해 이슈당 2초 대기
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchPixabayImages } from '@/lib/pixabay'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20')

    // thumbnail_urls 없는 이슈 조회 (승인 상태 포함, 최신순)
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category')
        .or('thumbnail_urls.is.null,thumbnail_urls.eq.{}')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        return NextResponse.json({ error: '이슈 조회 실패', detail: error.message }, { status: 500 })
    }

    if (!issues || issues.length === 0) {
        return NextResponse.json({ message: '처리할 이슈가 없습니다', processed: 0 })
    }

    const results: Array<{ id: string; title: string; success: boolean; count: number }> = []

    for (const issue of issues) {
        const thumbnailUrls = await fetchPixabayImages(issue.title, issue.category)

        if (thumbnailUrls.length > 0) {
            await supabaseAdmin
                .from('issues')
                .update({
                    thumbnail_urls: thumbnailUrls,
                    primary_thumbnail_index: 0,
                })
                .eq('id', issue.id)
        }

        results.push({
            id: issue.id,
            title: issue.title,
            success: thumbnailUrls.length > 0,
            count: thumbnailUrls.length,
        })

        // Groq rate limit 방지: 2초 대기
        await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
        processed: results.length,
        success: successCount,
        failed: results.length - successCount,
        results,
    })
}
