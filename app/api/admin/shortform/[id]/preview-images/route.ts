/**
 * app/api/admin/shortform/[id]/preview-images/route.ts
 *
 * [관리자 - 숏폼 이미지 미리보기 API]
 *
 * POST body: { sceneTexts: string[], seed?: number }
 * 씬별 텍스트를 받아 각 씬에 맞는 Pexels 이미지를 개별 검색해 반환.
 * sceneTexts 없이 호출 시 이슈 제목 기반 단일 검색으로 폴백.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { fetchNStockImagesWithFull, fetchSceneImagesWithFull } from '@/lib/shortform/fetch-stock-images'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function getJob(id: string) {
    const { data: job, error } = await supabaseAdmin
        .from('shortform_jobs')
        .select('*, issues!inner(category)')
        .eq('id', id)
        .single()
    if (error || !job) return null
    return job
}

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    let body: { sceneTexts?: string[]; seed?: number } = {}
    try { body = await request.json() } catch { /* body 없으면 폴백 */ }

    const { sceneTexts, seed } = body

    try {
        const job = await getJob(id)
        if (!job) return NextResponse.json({ error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' }, { status: 404 })

        const category = (job.issues as any)?.category ?? '사회'

        if (sceneTexts && sceneTexts.length > 0) {
            const { previews, fulls } = await fetchSceneImagesWithFull(sceneTexts, category, seed)
            return NextResponse.json({ images: previews, fullImages: fulls })
        }

        // 폴백: 이슈 제목 기반 단일 검색
        const count = Math.min(sceneTexts?.length ?? 3, 10)
        const { previews, fulls } = await fetchNStockImagesWithFull(category, job.issue_title, count, seed)
        return NextResponse.json({ images: previews, fullImages: fulls })
    } catch (error) {
        console.error('[preview-images] 에러:', error)
        return NextResponse.json({ error: 'FETCH_ERROR', message: '이미지 조회 실패' }, { status: 500 })
    }
}

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
        const job = await getJob(id)
        if (!job) return NextResponse.json({ error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' }, { status: 404 })

        const category = (job.issues as any)?.category ?? '사회'
        const { previews, fulls } = await fetchNStockImagesWithFull(category, job.issue_title, count, seed)

        if (previews.length === 0) {
            console.error(`[preview-images] 이미지 0건 jobId=${id} category=${category} title="${job.issue_title}"`)
        }

        return NextResponse.json({ images: previews, fullImages: fulls })
    } catch (error) {
        console.error('[preview-images] 에러:', error)
        return NextResponse.json({ error: 'FETCH_ERROR', message: '이미지 조회 실패' }, { status: 500 })
    }
}
