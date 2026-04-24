/**
 * app/api/admin/issues/[id]/remove-thumbnails/route.ts
 *
 * [관리자 - 대표 이미지 해제 API]
 *
 * primary_thumbnail_index를 -1로 설정하여 대표 이미지 선택을 해제합니다.
 * thumbnail_urls는 삭제하지 않고 유지합니다.
 * 슬라이드에서는 그라디언트 배경이 표시되며, 이미지를 다시 선택하면 복원됩니다.
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
                primary_thumbnail_index: -1,
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
