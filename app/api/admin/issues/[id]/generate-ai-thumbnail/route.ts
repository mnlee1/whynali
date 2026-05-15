/**
 * app/api/admin/issues/[id]/generate-ai-thumbnail/route.ts
 *
 * [관리자] AI 썸네일 생성
 *
 * POST /api/admin/issues/:id/generate-ai-thumbnail
 * POST /api/admin/issues/:id/generate-ai-thumbnail?forceFree=true  ← 무료 테스트
 *
 * 우선순위:
 *   1. Vertex AI (Cloud 크레딧) — 기본
 *   2. Gemini API 무료 티어 — 크레딧 소진 시 자동 폴백 or forceFree=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { generateVertexThumbnail } from '@/lib/vertex-imagen'
import { generateGeminiFreeThumbnail } from '@/lib/gemini-imagen'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params
    const forceFree = request.nextUrl.searchParams.get('forceFree') === 'true'

    const { data: issue, error: fetchError } = await supabaseAdmin
        .from('issues')
        .select('title, category, thumbnail_urls')
        .eq('id', id)
        .single()

    if (fetchError || !issue) {
        return NextResponse.json(
            { error: 'NOT_FOUND', message: '이슈를 찾을 수 없습니다' },
            { status: 404 }
        )
    }

    let aiUrl: string | null = null
    let usedModel: 'vertex' | 'gemini-free' = 'vertex'

    if (forceFree) {
        usedModel = 'gemini-free'
        try {
            aiUrl = await generateGeminiFreeThumbnail(issue.title, issue.category, id)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[route] Gemini-Free 에러:', msg)
            return NextResponse.json(
                { error: 'GEMINI_FREE_ERROR', message: `[디버그] ${msg}` },
                { status: 500 }
            )
        }
    } else {
        // 기본 모드 — Vertex AI 시도, 크레딧 소진 시 Gemini 무료로 폴백
        try {
            aiUrl = await generateVertexThumbnail(issue.title, issue.category, id)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg === 'CREDITS_EXHAUSTED') {
                console.log('[generate-ai-thumbnail] 크레딧 소진 → Gemini 무료로 폴백')
                usedModel = 'gemini-free'
                aiUrl = await generateGeminiFreeThumbnail(issue.title, issue.category, id)
            } else {
                console.error('[route] Vertex AI 에러:', msg)
                return NextResponse.json(
                    { error: 'VERTEX_ERROR', message: `[디버그] ${msg}` },
                    { status: 500 }
                )
            }
        }
    }

    if (!aiUrl) {
        return NextResponse.json(
            {
                error: usedModel === 'gemini-free' ? 'FREE_QUOTA_EXCEEDED' : 'GENERATION_FAILED',
                message: usedModel === 'gemini-free'
                    ? '무료 할당량(500장/일) 초과 또는 생성 실패'
                    : 'AI 썸네일 생성 실패. 서버 로그를 확인하세요.',
            },
            { status: 500 }
        )
    }

    const existingUrls: string[] = issue.thumbnail_urls ?? []
    const updatedUrls = [aiUrl, ...existingUrls.filter(u => u !== aiUrl)]

    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({
            thumbnail_urls: updatedUrls,
            primary_thumbnail_index: 0,
        })
        .eq('id', id)

    if (updateError) {
        console.error('[generate-ai-thumbnail] DB 업데이트 실패:', updateError)
        return NextResponse.json(
            { error: 'DB_ERROR', message: 'DB 저장 실패' },
            { status: 500 }
        )
    }

    return NextResponse.json({
        success: true,
        ai_thumbnail_url: aiUrl,
        thumbnail_urls: updatedUrls,
        usedModel,
    })
}
