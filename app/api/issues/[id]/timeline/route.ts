/**
 * app/api/issues/[id]/timeline/route.ts
 * 
 * [타임라인 포인트 조회 API]
 * 
 * GET: 이슈의 타임라인 포인트 목록을 시간순으로 조회합니다.
 * 
 * 참고: 타임라인 포인트 추가는 자동 생성 Cron을 통해서만 가능합니다.
 *       (중립성 유지, 조작 의혹 방지)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('timeline_points')
            .select('*')
            .eq('issue_id', id)
            .order('occurred_at', { ascending: true })

        if (error) throw error

        return NextResponse.json({ data: data ?? [] })
    } catch (error) {
        console.error('Timeline fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '타임라인 조회 실패' },
            { status: 500 }
        )
    }
}
