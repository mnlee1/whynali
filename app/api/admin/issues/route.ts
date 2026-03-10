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
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT_TO_REGISTER } from '@/lib/config/candidate-thresholds'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')
    const search = searchParams.get('search')

    // approval_status 파라미터 파싱: "승인:auto", "반려:manual" 등 처리
    let filterStatus: string | null = null
    let filterType: string | null = null
    
    if (approvalStatus && approvalStatus.includes(':')) {
        const [status, type] = approvalStatus.split(':')
        filterStatus = status
        filterType = type
    } else if (approvalStatus) {
        filterStatus = approvalStatus
    }

    try {
        /*
         * [자동 반려 로직 제거됨]
         * 화력이 낮아도 관리자가 직접 확인하고 판단할 수 있도록
         * 모든 이슈를 목록에 표시합니다.
         */

        let query = supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .not('approval_status', 'is', null) // 임시 이슈(null) 제외
            // 화력 낮은 이슈도 목록에 표시 (관리자가 직접 판단)
            .order('heat_index', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })

        // approval_status 필터 적용
        if (filterStatus) {
            query = query.eq('approval_status', filterStatus)
        }

        // approval_type 필터 적용
        if (filterType) {
            query = query.eq('approval_type', filterType)
        }

        if (search && search.trim()) {
            query = query.ilike('title', `%${search.trim()}%`)
        }

        const { data, error, count } = await query

        if (error) throw error

        // 긴급 이슈 개수 계산 (화력 30점 이상 + 연예/정치 + 대기 상태)
        const urgentCount = (data ?? []).filter(issue => 
            issue.approval_status === '대기' &&
            (issue.heat_index ?? 0) >= 30 &&
            ['연예', '정치'].includes(issue.category)
        ).length

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
            urgentCount,
        })
    } catch (error) {
        console.error('관리자 이슈 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '이슈 조회 실패' },
            { status: 500 }
        )
    }
}
