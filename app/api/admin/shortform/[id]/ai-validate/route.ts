/**
 * app/api/admin/shortform/[id]/ai-validate/route.ts
 * 
 * [관리자 - 숏폼 이미지 AI 적합성 판별]
 * 
 * POST /api/admin/shortform/[id]/ai-validate
 * 
 * 생성된 숏폼 이미지를 Claude Vision으로 검증하고 결과를 DB에 저장합니다.
 * 
 * 판별 기준:
 * - 이슈 제목이 명확하게 표시되는가
 * - 텍스트가 읽기 가능한가
 * - 부적절하거나 혐오적인 내용이 없는가
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { validateShortformImage } from '@/lib/shortform/ai-validate'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { 
                    error: 'SERVICE_UNAVAILABLE', 
                    message: 'GEMINI_API_KEY가 설정되지 않았습니다' 
                },
                { status: 503 }
            )
        }

        const { data: job, error: jobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_title, video_path')
            .eq('id', id)
            .single()

        if (jobError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_IMAGE', message: '이미지가 아직 생성되지 않았습니다' },
                { status: 400 }
            )
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'
        const imageUrl = `${siteUrl}${job.video_path}`

        const validationResult = await validateShortformImage(imageUrl, job.issue_title)

        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({
                ai_validation: validationResult,
            })
            .eq('id', id)

        if (updateError) {
            throw new Error('AI 검증 결과 저장 실패')
        }

        return NextResponse.json({
            success: true,
            validation: validationResult,
        })
    } catch (error) {
        console.error('[AI 검증 에러]:', error)
        return NextResponse.json(
            { 
                error: 'VALIDATION_ERROR', 
                message: error instanceof Error ? error.message : 'AI 검증 실패' 
            },
            { status: 500 }
        )
    }
}
