/**
 * app/api/test/unsplash-batch/route.ts
 *
 * [테스트 전용] 기존 이슈 일괄 Unsplash 이미지 적용
 * 사용 후 이 파일 삭제할 것
 *
 * 사용법:
 * GET /api/test/unsplash-batch?limit=45
 * → thumbnail_url 없는 이슈를 limit개만큼 처리
 * → Unsplash 데모 플랜 한도(50회/시간) 고려해 기본값 45
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchUnsplashImage } from '@/lib/unsplash'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '45')

    // thumbnail_url 없는 이슈 조회 (모든 상태 포함)
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category')
        .is('thumbnail_url', null)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        return NextResponse.json({ error: '이슈 조회 실패' }, { status: 500 })
    }

    if (!issues || issues.length === 0) {
        return NextResponse.json({ message: '처리할 이슈가 없습니다', processed: 0 })
    }

    const results: Array<{ id: string; title: string; success: boolean; url: string | null }> = []

    for (const issue of issues) {
        const thumbnailUrl = await fetchUnsplashImage(issue.title, issue.category)

        if (thumbnailUrl) {
            await supabaseAdmin
                .from('issues')
                .update({ thumbnail_url: thumbnailUrl })
                .eq('id', issue.id)
        }

        results.push({
            id: issue.id,
            title: issue.title,
            success: !!thumbnailUrl,
            url: thumbnailUrl,
        })

        // API 과부하 방지: 각 이슈 사이 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
        processed: results.length,
        success: successCount,
        failed: results.length - successCount,
        results,
    })
}
