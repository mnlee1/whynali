/**
 * app/api/admin/shortform/[id]/generate/route.ts
 * 
 * [관리자 - 숏폼 이미지 생성 API]
 * 
 * 승인된 숏폼 job의 이미지 카드를 생성하고 Supabase Storage에 업로드합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { generateShortformImage, generateImageFilename } from '@/lib/shortform/generate-image'
import type { ShortformJob } from '@/types/shortform'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 1. Job 조회
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.approval_status !== 'approved') {
            return NextResponse.json(
                { error: 'NOT_APPROVED', message: '승인된 job만 이미지를 생성할 수 있습니다' },
                { status: 422 }
            )
        }

        if (job.video_path) {
            return NextResponse.json(
                { error: 'ALREADY_GENERATED', message: '이미 이미지가 생성되었습니다', path: job.video_path },
                { status: 409 }
            )
        }

        // 2. 이미지 생성
        const imageBuffer = await generateShortformImage(job as ShortformJob)
        const filename = generateImageFilename(job.id)

        // 3. Supabase Storage에 업로드
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('shortform')
            .upload(filename, imageBuffer, {
                contentType: 'image/png',
                upsert: false,
            })

        if (uploadError) {
            console.error('Supabase Storage 업로드 실패:', uploadError)
            return NextResponse.json(
                { error: 'UPLOAD_ERROR', message: 'Storage 업로드 실패: ' + uploadError.message },
                { status: 500 }
            )
        }

        // 4. Job의 video_path 업데이트 (실제로는 이미지지만 필드명 유지)
        const storagePath = uploadData.path
        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: storagePath })
            .eq('id', id)

        if (updateError) {
            console.error('Job 업데이트 실패:', updateError)
            // Storage에 업로드는 성공했으므로 롤백하지 않음 (재시도 가능)
            return NextResponse.json(
                { error: 'UPDATE_ERROR', message: 'Job 업데이트 실패' },
                { status: 500 }
            )
        }

        // 5. 공개 URL 생성
        const { data: urlData } = supabaseAdmin
            .storage
            .from('shortform')
            .getPublicUrl(storagePath)

        await writeAdminLog(
            '숏폼 이미지 생성',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" → ${filename}`
        )

        return NextResponse.json({
            success: true,
            path: storagePath,
            publicUrl: urlData.publicUrl,
            filename,
        })
    } catch (error) {
        console.error('숏폼 이미지 생성 에러:', error)
        const message = error instanceof Error ? error.message : '이미지 생성 실패'
        return NextResponse.json(
            { error: 'GENERATE_ERROR', message },
            { status: 500 }
        )
    }
}
