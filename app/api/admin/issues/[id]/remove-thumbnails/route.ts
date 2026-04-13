/**
 * app/api/admin/issues/[id]/remove-thumbnails/route.ts
 *
 * [관리자 - 이슈 이미지 제거 API]
 *
 * thumbnail_urls를 빈 배열로 설정하여 이미지를 제거합니다.
 * 슬라이드에서는 그라디언트 배경이 표시됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { error } = await supabaseAdmin
            .from('issues')
            .update({
                thumbnail_urls: [],
                primary_thumbnail_index: 0,
            })
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('이미지 제거 에러:', error)
        return NextResponse.json(
            { error: 'REMOVE_ERROR', message: '이미지 제거 실패' },
            { status: 500 }
        )
    }
}
