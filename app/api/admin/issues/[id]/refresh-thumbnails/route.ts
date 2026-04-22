/**
 * app/api/admin/issues/[id]/refresh-thumbnails/route.ts
 *
 * [관리자 - 이슈 이미지 재검색 API]
 *
 * Unsplash에서 새로운 이미지 3개를 다시 검색합니다.
 * primary_thumbnail_index는 0으로 초기화됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { fetchPixabayImages } from '@/lib/pixabay'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { data: issue, error: fetchError } = await supabaseAdmin
            .from('issues')
            .select('title, category')
            .eq('id', id)
            .single()

        if (fetchError) throw fetchError

        const thumbnailUrls = await fetchPixabayImages(issue.title, issue.category)

        if (thumbnailUrls.length === 0) {
            return NextResponse.json(
                { error: 'NO_IMAGES', message: '이미지를 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                thumbnail_urls: thumbnailUrls,
                primary_thumbnail_index: 0,
            })
            .eq('id', id)

        if (updateError) throw updateError

        return NextResponse.json({
            success: true,
            thumbnail_urls: thumbnailUrls,
        })
    } catch (error) {
        console.error('이미지 재검색 에러:', error)
        return NextResponse.json(
            { error: 'REFRESH_ERROR', message: '이미지 재검색 실패' },
            { status: 500 }
        )
    }
}
