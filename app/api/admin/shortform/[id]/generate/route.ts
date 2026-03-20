/**
 * app/api/admin/shortform/[id]/generate/route.ts
 * 
 * [관리자 - 숏폼 동영상 생성 API]
 * 
 * 승인된 숏폼 job의 3-Scene MP4 동영상을 생성하고 Supabase Storage에 업로드합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { generate3SceneShortform } from '@/lib/shortform/generate-image'
import { validateShortformImage } from '@/lib/shortform/ai-validate'
import type { ShortformJob } from '@/types/shortform'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 1. Job 조회 (issues 테이블의 category도 함께)
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

        if (job.approval_status === 'rejected') {
            return NextResponse.json(
                { error: 'REJECTED', message: '반려된 job은 동영상을 생성할 수 없습니다' },
                { status: 422 }
            )
        }

        if (job.video_path) {
            return NextResponse.json(
                { error: 'ALREADY_GENERATED', message: '이미 동영상이 생성되었습니다', path: job.video_path },
                { status: 409 }
            )
        }

        // 2. MP4 동영상 생성 (3-Scene)
        const videoBuffer = await generate3SceneShortform({
            issueTitle: job.issue_title,
            issueCategory: (job.issues as any)?.category ?? '사회',
            issueStatus: job.issue_status,
            heatGrade: job.heat_grade,
            newsCount: job.source_count?.news ?? 0,
            communityCount: job.source_count?.community ?? 0,
            issueUrl: job.issue_url,
        })
        const filename = `shortform-${job.id}-${Date.now()}.mp4`

        // 3. Supabase Storage에 업로드
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('shortform')
            .upload(filename, videoBuffer, {
                contentType: 'video/mp4',
                upsert: false,
            })

        if (uploadError) {
            console.error('Supabase Storage 업로드 실패:', uploadError)
            return NextResponse.json(
                { error: 'UPLOAD_ERROR', message: 'Storage 업로드 실패: ' + uploadError.message },
                { status: 500 }
            )
        }

        // 4. 공개 URL 생성
        const storagePath = uploadData.path
        const { data: urlData } = supabaseAdmin
            .storage
            .from('shortform')
            .getPublicUrl(storagePath)

        // 5. AI 자동 검증 실행
        let aiValidation = null
        try {
            if (process.env.GEMINI_API_KEY) {
                aiValidation = await validateShortformImage(urlData.publicUrl, job.issue_title)
                console.log('[AI 검증 완료]', aiValidation)
            } else {
                console.warn('[AI 검증 스킵] GEMINI_API_KEY 없음')
            }
        } catch (aiError) {
            console.error('[AI 검증 실패]', aiError)
            // AI 검증 실패해도 동영상 생성은 완료 (검증은 보조 기능)
        }

        // 6. Job의 video_path + ai_validation 업데이트
        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ 
                video_path: storagePath,
                ai_validation: aiValidation,
            })
            .eq('id', id)

        if (updateError) {
            console.error('Job 업데이트 실패:', updateError)
            // Storage에 업로드는 성공했으므로 롤백하지 않음 (재시도 가능)
            return NextResponse.json(
                { error: 'UPDATE_ERROR', message: 'Job 업데이트 실패' },
                { status: 500 }
            )
        }

        await writeAdminLog(
            '숏폼 동영상 생성',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" → ${filename}` + 
            (aiValidation ? ` (AI: ${aiValidation.status})` : '')
        )

        return NextResponse.json({
            success: true,
            path: storagePath,
            publicUrl: urlData.publicUrl,
            filename,
            aiValidation,
        })
    } catch (error) {
        console.error('숏폼 동영상 생성 에러:', error)
        const message = error instanceof Error ? error.message : '동영상 생성 실패'
        return NextResponse.json(
            { error: 'GENERATE_ERROR', message },
            { status: 500 }
        )
    }
}
