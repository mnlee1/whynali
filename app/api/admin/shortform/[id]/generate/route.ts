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

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    // 미리보기 이미지 URL 배열 (있으면 Pexels 재검색 없이 재사용)
    let previewImages: string[] | undefined
    try {
        const body = await request.json()
        if (Array.isArray(body?.images) && body.images.length > 0) {
            previewImages = body.images
        }
    } catch { /* body 없거나 파싱 실패 시 무시 */ }

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

        // 2. issues 정보 별도 조회 (컬럼 없어도 실패하지 않음)
        let issueCategory = '사회'
        let issueDescription: string | undefined
        let briefBullets: string[] | undefined
        let briefConclusion: string | undefined
        try {
            const { data: issue } = await supabaseAdmin
                .from('issues')
                .select('category, topic_description, brief_summary')
                .eq('id', job.issue_id)
                .single()
            if (issue) {
                issueCategory = (issue as any).category ?? '사회'

                const brief = (issue as any).brief_summary as {
                    intro?: string
                    bullets?: string[]
                    conclusion?: string
                } | null | undefined

                if (brief) {
                    // 모든 brief 내용을 순서대로 수집 (intro → bullets → conclusion)
                    const allPieces: string[] = []
                    if (brief.intro?.trim()) allPieces.push(brief.intro.trim())
                    brief.bullets?.filter(Boolean).forEach(b => {
                        if (b.trim()) allPieces.push(b.trim())
                    })
                    if (brief.conclusion?.trim()) allPieces.push(brief.conclusion.trim())

                    // 씬2: 첫 번째 내용, 씬3: 마지막 내용 (같으면 undefined로 폴백)
                    briefBullets = allPieces.length > 0 ? [allPieces[0]] : undefined
                    briefConclusion = allPieces.length > 1
                        ? allPieces[allPieces.length - 1]
                        : undefined

                    // issueDescription: Groq 컨텍스트용 전체 조합
                    issueDescription = allPieces.join(' ') || undefined
                }

                // brief_summary 없으면 topic_description 폴백
                if (!issueDescription) {
                    issueDescription = (issue as any).topic_description || undefined
                }
            }
        } catch {
            // issues 조회 실패 시 기본값으로 진행
        }

        // 3. MP4 동영상 생성 (3-Scene)
        const videoBuffer = await generate3SceneShortform({
            issueTitle: job.issue_title,
            issueCategory,
            issueStatus: job.issue_status,
            heatGrade: job.heat_grade,
            newsCount: job.source_count?.news ?? 0,
            communityCount: job.source_count?.community ?? 0,
            issueUrl: job.issue_url,
            issueDescription,
            briefBullets,
            briefConclusion,
        }, 10, previewImages)
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

        // 5. Job의 video_path 업데이트
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
        console.error('숏폼 동영상 생성 에러:', error)
        const message = error instanceof Error ? error.message : '동영상 생성 실패'
        return NextResponse.json(
            { error: 'GENERATE_ERROR', message },
            { status: 500 }
        )
    }
}
