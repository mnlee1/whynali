/**
 * app/api/admin/shortform/route.ts
 * 
 * [관리자 - 숏폼 작업 관리 API]
 * 
 * GET: 숏폼 job 목록 조회
 * POST: 수동 숏폼 job 생성
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { createShortformJob } from '@/lib/shortform/create-job'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/shortform
 * 
 * 숏폼 job 목록 조회
 * 
 * Query Parameters:
 *   - approval_status: 'pending' | 'approved' | 'rejected'
 *   - trigger_type: 'issue_created' | 'status_changed'
 *   - limit: 조회 개수 (기본 50)
 *   - offset: 페이징 오프셋 (기본 0)
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')
    const triggerType = searchParams.get('trigger_type')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    try {
        let query = supabaseAdmin
            .from('shortform_jobs')
            .select('*', { count: 'exact' })
            .range(offset, offset + limit - 1)

        if (approvalStatus) {
            query = query.eq('approval_status', approvalStatus).order('created_at', { ascending: false })
        } else {
            // 전체 목록: 대기(0) → 승인(1) → 반려(2) 순, 같은 상태 내에서는 최신순
            query = query.order('status_priority', { ascending: true }).order('created_at', { ascending: false })
        }

        if (triggerType) {
            query = query.eq('trigger_type', triggerType)
        }

        const { data, error, count } = await query

        if (error) throw error

        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
        })
    } catch (error) {
        console.error('숏폼 job 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '숏폼 job 조회 실패' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/shortform
 * 
 * 수동 숏폼 job 생성
 * 
 * Body:
 *   - issueId: string (필수)
 *   - triggerType: 'issue_created' | 'status_changed' (선택, 기본 'issue_created')
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issueId, triggerType = 'issue_created' } = body

        if (!issueId) {
            return NextResponse.json(
                { error: 'INVALID_INPUT', message: 'issueId는 필수입니다' },
                { status: 400 }
            )
        }

        // 중복 job 확인 (같은 이슈 + pending/approved 상태 — trigger_type 무관)
        const { data: existingJobs } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, trigger_type')
            .eq('issue_id', issueId)
            .in('approval_status', ['pending', 'approved'])
            .limit(1)

        if (existingJobs && existingJobs.length > 0) {
            return NextResponse.json(
                { error: 'DUPLICATE_JOB', message: '이미 대기 또는 승인된 숏폼 job이 있습니다' },
                { status: 409 }
            )
        }

        const jobId = await createShortformJob({ issueId, triggerType, skipFilters: true })

        if (!jobId) {
            return NextResponse.json(
                { error: 'CREATE_BLOCKED', message: '숏폼 job 생성이 차단되었습니다' },
                { status: 422 }
            )
        }

        await writeAdminLog(
            '숏폼 job 수동 생성',
            'shortform_job',
            jobId,
            auth.adminEmail,
            `이슈: ${issueId}, 트리거: ${triggerType}`
        )

        return NextResponse.json({ jobId }, { status: 201 })
    } catch (error) {
        console.error('숏폼 job 생성 에러:', error)
        const message = error instanceof Error ? error.message : '숏폼 job 생성 실패'
        return NextResponse.json(
            { error: 'CREATE_ERROR', message },
            { status: 500 }
        )
    }
}
