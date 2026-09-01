/**
 * app/api/admin/longform/route.ts
 *
 * [관리자 - 옴니버스형 롱폼(완료된 숏폼 여러 개를 이어붙인 영상) job 관리 API]
 *
 * GET: 롱폼 job 목록 조회
 * POST: 완료된 숏폼 job들을 이어붙여 옴니버스 롱폼 생성
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { type OmnibusHookConfig } from '@/lib/longform/create-omnibus-video'
import { generateAndSaveOmnibusJob } from '@/lib/longform/save-omnibus-job'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/admin/longform
 *
 * Query Parameters:
 *   - approval_status: 'pending' | 'approved' | 'rejected'
 *   - limit: 조회 개수 (기본 50)
 *   - offset: 페이징 오프셋 (기본 0)
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const searchParams = request.nextUrl.searchParams
    const approvalStatus = searchParams.get('approval_status')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    try {
        let query = supabaseAdmin
            .from('longform_jobs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

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
        console.error('롱폼 job 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '롱폼 job 조회 실패' },
            { status: 500 }
        )
    }
}

interface GenerateBody {
    shortformJobIds?: string[]
    hook?: OmnibusHookConfig
    outputMode?: 'vertical' | 'landscape'
}

/**
 * POST /api/admin/longform
 *
 * Body:
 *   - shortformJobIds: string[] (필수, 2개 이상 — 배열 순서 = 영상 내 등장 순서, 첫 번째가 훅 대상)
 *   - hook: { sentenceA, sentenceB?, highlightsA?, highlightsB?, imageQuery?, imageCategory?, imageSeed? } (필수, sentenceA는 필수)
 *   - outputMode: 'vertical' | 'landscape' (선택, 기본 'landscape')
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: GenerateBody
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const shortformJobIds = (body.shortformJobIds ?? []).filter(id => typeof id === 'string' && id)
    const hook: OmnibusHookConfig = {
        sentenceA: body.hook?.sentenceA?.trim() ?? '',
        sentenceB: body.hook?.sentenceB,
        highlightsA: body.hook?.highlightsA ?? [],
        highlightsB: body.hook?.highlightsB ?? [],
        imageQuery: body.hook?.imageQuery,
        imageCategory: body.hook?.imageCategory,
        imageSeed: body.hook?.imageSeed,
    }

    const result = await generateAndSaveOmnibusJob({
        shortformJobIds,
        hook,
        // 롱폼은 일반 유튜브 영상(가로 16:9)이 기본 — 세로 옵션은 outputMode를 명시로 넘길 때만
        outputMode: body.outputMode ?? 'landscape',
        actorEmail: auth.adminEmail,
    })

    if (!result.ok) {
        return NextResponse.json({ error: result.error, message: result.message }, { status: result.status ?? 500 })
    }

    return NextResponse.json({
        success: true,
        id: result.id,
        path: result.path,
        publicUrl: result.publicUrl,
        filename: result.filename,
    })
}
