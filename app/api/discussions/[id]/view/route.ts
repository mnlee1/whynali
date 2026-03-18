/**
 * app/api/discussions/[id]/view/route.ts
 *
 * [토론 주제 조회수 증가 API]
 *
 * 토론 상세 페이지 방문 시 view_count를 1 증가시킵니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const admin = createSupabaseAdminClient()

        // 현재 view_count 조회
        const { data, error: selectError } = await admin
            .from('discussion_topics')
            .select('view_count')
            .eq('id', id)
            .single()

        if (selectError) {
            console.error('[view] select error:', selectError)
            throw selectError
        }

        // view_count + 1 업데이트
        const { error: updateError } = await admin
            .from('discussion_topics')
            .update({ view_count: (data?.view_count ?? 0) + 1 })
            .eq('id', id)

        if (updateError) {
            console.error('[view] update error:', updateError)
            throw updateError
        }

        return NextResponse.json({ success: true, view_count: (data?.view_count ?? 0) + 1 })
    } catch (error) {
        console.error('Discussion view count increment error:', error)
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: '조회수 업데이트 실패' },
            { status: 500 }
        )
    }
}
