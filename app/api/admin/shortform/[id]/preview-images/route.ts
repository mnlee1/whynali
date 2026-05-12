/**
 * app/api/admin/shortform/[id]/preview-images/route.ts
 *
 * [관리자 - 숏폼 이미지 미리보기 API]
 *
 * ?count=N 파라미터로 이미지 개수를 동적으로 지정할 수 있습니다.
 * ?seed=숫자 전달 시 다른 이미지 세트를 반환합니다 (재생성용).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { fetchNStockImagesWithFull } from '@/lib/shortform/fetch-stock-images'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const seedParam = searchParams.get('seed')
    const countParam = searchParams.get('count')

    const seed = seedParam !== null ? parseInt(seedParam) : undefined
    const count = countParam !== null ? Math.min(Math.max(parseInt(countParam), 1), 10) : 3

    try {
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*, issues!inner(category)')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        const category = (job.issues as any)?.category ?? '사회'
        const { previews, fulls } = await fetchNStockImagesWithFull(category, job.issue_title, count, seed)

        return NextResponse.json({ images: previews, fullImages: fulls })
    } catch (error) {
        console.error('[preview-images] 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '이미지 조회 실패' },
            { status: 500 }
        )
    }
}
