/**
 * app/api/admin/issues/route.ts
 * 
 * [관리자 - 이슈 관리 API]
 * 
 * 모든 이슈 조회 (승인 대기 포함)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')

    try {
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
