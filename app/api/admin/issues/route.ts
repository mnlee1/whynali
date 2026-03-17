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

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')
    const approvalType = searchParams.get('approval_type')
    const search = searchParams.get('search')
    const sourceTrack = searchParams.get('source_track')

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
    
    // approval_type 파라미터가 별도로 전달된 경우 우선 사용
    if (approvalType) {
        filterType = approvalType
    }

    try {
        let query = supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .not('approval_status', 'is', null)
            .neq('approval_status', '병합됨')
            // 자동반려 이슈 제외: NOT (approval_status='반려' AND approval_type='auto')
            // = approval_status != '반려' OR approval_type IS NULL OR approval_type != 'auto'
            // 단, filterStatus='반려' 필터 시에는 아래 조건이 덮어씌워짐 (관리자반려는 manual만 조회)
            .or('approval_status.neq.반려,approval_type.is.null,approval_type.neq.auto')
            .order('heat_index', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })

        // source_track 필터 적용 (Track A 이슈만 표시)
        // null 값도 포함하도록 수정 (레거시 데이터 대응)
        if (sourceTrack) {
            query = query.or(`source_track.eq.${sourceTrack},source_track.is.null`)
        }

        // approval_status 필터 적용
        if (filterStatus) {
            query = query.eq('approval_status', filterStatus)
        }

        // approval_type 필터 적용
        if (filterType) {
            if (filterType === 'manual') {
                // 관리자 승인/반려: approval_type이 null이거나 'manual'
                query = query.or('approval_type.is.null,approval_type.eq.manual')
            } else {
                // 자동 승인/반려: approval_type = 'auto'
                query = query.eq('approval_type', filterType)
            }
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
