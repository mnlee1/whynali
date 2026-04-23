/**
 * app/api/issues/[id]/timeline/[pointId]/route.ts
 *
 * 타임라인 포인트 개별 조작 API.
 * 관리자가 특정 타임라인 포인트를 삭제할 때 사용합니다.
 *
 * DELETE: timeline_points 삭제 + 연결된 news_data.issue_id = null 처리
 * news_data 연결을 함께 끊어야 update-timeline cron이 같은 뉴스를 재삽입하지 않습니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string; pointId: string }> }
) {
    const { id: issueId, pointId } = await context.params

    try {
        // 삭제 전 source_url 조회 (news_data 연결 해제에 필요)
        const { data: point } = await supabaseAdmin
            .from('timeline_points')
            .select('source_url')
            .eq('id', pointId)
            .single()

        // timeline_points 삭제
        const { error: deleteError } = await supabaseAdmin
            .from('timeline_points')
            .delete()
            .eq('id', pointId)

        if (deleteError) throw deleteError

        // news_data 연결 해제 — 같은 URL의 뉴스를 이 이슈에서 분리
        // source_url이 없으면 건너뜀 (수동 생성 포인트 등)
        if (point?.source_url) {
            await supabaseAdmin
                .from('news_data')
                .update({ issue_id: null })
                .eq('issue_id', issueId)
                .eq('link', point.source_url)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Timeline point delete error:', error)
        return NextResponse.json(
            { error: 'DELETE_ERROR', message: '타임라인 포인트 삭제 실패' },
            { status: 500 }
        )
    }
}
