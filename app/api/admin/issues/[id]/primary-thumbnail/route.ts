/**
 * app/api/admin/issues/[id]/primary-thumbnail/route.ts
 *
 * [관리자 - 대표 이미지 인덱스 변경 API]
 *
 * thumbnail_urls 배열 중 어떤 이미지를 대표로 사용할지 설정합니다.
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
        const body = await request.json()
        const { index } = body

        if (typeof index !== 'number' || index < 0 || index > 2) {
            return NextResponse.json(
                { error: 'INVALID_INDEX', message: '인덱스는 0~2 사이여야 합니다' },
                { status: 400 }
            )
        }

        const { error } = await supabaseAdmin
            .from('issues')
            .update({ primary_thumbnail_index: index })
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('대표 이미지 설정 에러:', error)
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: '대표 이미지 설정 실패' },
            { status: 500 }
        )
    }
}
