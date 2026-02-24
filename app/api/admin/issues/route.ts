/**
 * app/api/admin/issues/route.ts
 * 
 * [관리자 - 이슈 관리 API]
 * 
 * 모든 이슈 조회 (승인 대기 포함)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* 이슈 목록 노출 최소 화력 기준 (issue-candidate.ts의 MIN_HEAT_TO_REGISTER와 동일) */
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')

    try {
        /*
         * 대기 이슈 조회 시, heat_index < MIN_HEAT_TO_REGISTER인 항목을 자동 반려 처리.
         * issue-candidate.ts 도입 이전에 등록된 낮은 화력 이슈도 여기서 정리된다.
         */
        if (!approvalStatus || approvalStatus === '대기') {
            const { data: lowHeatIds } = await supabaseAdmin
                .from('issues')
                .select('id')
                .eq('approval_status', '대기')
                .lt('heat_index', MIN_HEAT_TO_REGISTER)

            if (lowHeatIds && lowHeatIds.length > 0) {
                await supabaseAdmin
                    .from('issues')
                    .update({ approval_status: '반려' })
                    .in('id', lowHeatIds.map((r) => r.id))
            }
        }

        let query = supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })

        if (approvalStatus) {
            query = query.eq('approval_status', approvalStatus)
        }

        const { data, error, count } = await query

        if (error) throw error

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
        })
    } catch (error) {
        console.error('관리자 이슈 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '이슈 조회 실패' },
            { status: 500 }
        )
    }
}
