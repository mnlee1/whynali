/**
 * app/api/admin/shortform/[id]/generate/route.ts
 *
 * [관리자 - 숏폼 동영상 생성 API]
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { generateNSceneShortform } from '@/lib/shortform/generate-image'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    let previewImages: string[] | undefined
    let sceneTexts: string[] | undefined
    try {
        const body = await request.json()
        if (Array.isArray(body?.images) && body.images.length > 0) {
            previewImages = body.images
        }
        if (Array.isArray(body?.sceneTexts) && body.sceneTexts.length > 0) {
            sceneTexts = (body.sceneTexts as unknown[])
                .map(t => (typeof t === 'string' ? t : ''))
                .filter(Boolean)
        }
    } catch { /* body 없거나 파싱 실패 시 무시 */ }

    try {
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

        let issueCategory = '사회'
        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('category')
            .eq('id', job.issue_id)
            .single()

        if (issueError) {
            return NextResponse.json(
                { error: 'ISSUE_FETCH_ERROR', message: `이슈 정보 조회 실패: ${issueError.message}` },
                { status: 500 }
            )
        }
        issueCategory = (issue as any)?.category ?? '사회'

        if (!sceneTexts || sceneTexts.length === 0) {
            return NextResponse.json(
                { error: 'NO_SCENE_TEXTS', message: '씬 텍스트가 없습니다. 숏폼 관리 화면에서 자막을 입력해 주세요.' },
                { status: 422 }
            )
        }

        const videoBuffer = await generateNSceneShortform(job.issue_title, issueCategory, sceneTexts, previewImages)
        const filename = `shortform-${job.id}-${Date.now()}.mp4`

        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('shortform')
            .upload(filename, videoBuffer, {
                contentType: 'video/mp4',
                upsert: false,
            })

        if (uploadError) {
            return NextResponse.json(
                { error: 'UPLOAD_ERROR', message: 'Storage 업로드 실패: ' + uploadError.message },
                { status: 500 }
            )
        }

        const storagePath = uploadData.path
        const { data: urlData } = supabaseAdmin
            .storage
            .from('shortform')
            .getPublicUrl(storagePath)

        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: storagePath })
            .eq('id', id)

        if (updateError) {
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
            `이슈: "${job.issue_title}" → ${filename}`
        )

        return NextResponse.json({
            success: true,
            path: storagePath,
            publicUrl: urlData.publicUrl,
            filename,
        })
    } catch (error) {
        console.error('[숏폼] 동영상 생성 에러:', error)
        const message = error instanceof Error ? error.message : '동영상 생성 실패'
        return NextResponse.json(
            { error: 'GENERATE_ERROR', message },
            { status: 500 }
        )
    }
}
