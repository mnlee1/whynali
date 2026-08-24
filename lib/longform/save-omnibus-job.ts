/**
 * lib/longform/save-omnibus-job.ts
 *
 * 숏폼 job id 배열 + 훅 설정을 받아 옴니버스 롱폼을 생성하고,
 * Storage 업로드 + longform_jobs row 기록까지 한 번에 처리.
 *
 * app/api/admin/longform/route.ts(관리자 생성)에서 호출한다.
 */

import { supabaseAdmin } from '@/lib/supabase-server'
import { writeAdminLog } from '@/lib/admin-log'
import { generateOmnibusLongform, type OmnibusJob, type OmnibusHookConfig } from './create-omnibus-video'

export interface SaveOmnibusParams {
    shortformJobIds: string[]
    hook: OmnibusHookConfig
    outputMode?: 'vertical' | 'landscape'
    /** admin_logs에 남길 실행 주체(관리자 이메일) */
    actorEmail: string | null
}

export interface SaveOmnibusResult {
    ok: boolean
    id?: string
    path?: string
    publicUrl?: string
    filename?: string
    error?: string
    message?: string
    status?: number
}

export async function generateAndSaveOmnibusJob(params: SaveOmnibusParams): Promise<SaveOmnibusResult> {
    const { shortformJobIds, hook, outputMode = 'vertical', actorEmail } = params

    if (shortformJobIds.length < 2) {
        return { ok: false, error: 'INVALID_INPUT', message: '옴니버스 롱폼은 최소 2개의 숏폼 job이 필요합니다', status: 400 }
    }
    if (!hook.sentenceA?.trim()) {
        return { ok: false, error: 'INVALID_INPUT', message: '훅 문장(hook.sentenceA)은 필수입니다', status: 400 }
    }

    try {
        const { data: rows, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_title, video_path, issues(category)')
            .in('id', shortformJobIds)

        if (selectError) throw selectError

        // 요청한 순서(등장 순서) 그대로 재배열 — .in()은 순서를 보장하지 않음
        const rowById = new Map((rows ?? []).map(r => [r.id as string, r]))
        const missingIds = shortformJobIds.filter(id => !rowById.has(id))
        if (missingIds.length > 0) {
            return { ok: false, error: 'NOT_FOUND', message: `숏폼 job을 찾을 수 없습니다: ${missingIds.join(', ')}`, status: 404 }
        }

        const noVideoIds = shortformJobIds.filter(id => !rowById.get(id)!.video_path)
        if (noVideoIds.length > 0) {
            return { ok: false, error: 'NOT_GENERATED', message: `아직 동영상이 생성되지 않은 숏폼 job이 있습니다: ${noVideoIds.join(', ')}`, status: 422 }
        }

        const omnibusJobs: OmnibusJob[] = shortformJobIds.map(id => {
            const row = rowById.get(id)!
            return {
                id: row.id as string,
                issueTitle: row.issue_title as string,
                videoPath: row.video_path as string,
            }
        })

        // 훅 배경 이미지 검색어/카테고리 — 호출자가 지정 안 했으면 첫 번째(훅 대상) 이슈로 자동 유도
        // (본편 씬 이미지와는 어차피 Pexels 새 검색이라 중복 안 되고, 이슈와 무관한 제네릭 이미지 대신 실제 내용과 관련된 이미지가 나오도록)
        const heroRow = rowById.get(shortformJobIds[0]) as any
        const resolvedHook = {
            ...hook,
            imageQuery: hook.imageQuery ?? heroRow?.issue_title,
            imageCategory: hook.imageCategory ?? heroRow?.issues?.category,
        }

        const { videoBuffer, chapters } = await generateOmnibusLongform(omnibusJobs, resolvedHook, { outputMode })

        const filename = `longform-${Date.now()}.mp4`
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('longform')
            .upload(filename, videoBuffer, {
                contentType: 'video/mp4',
                upsert: false,
            })

        if (uploadError) {
            return { ok: false, error: 'UPLOAD_ERROR', message: 'Storage 업로드 실패: ' + uploadError.message, status: 500 }
        }

        const storagePath = uploadData.path
        const { data: urlData } = supabaseAdmin
            .storage
            .from('longform')
            .getPublicUrl(storagePath)

        const { data: jobRow, error: insertError } = await supabaseAdmin
            .from('longform_jobs')
            .insert({
                source_job_ids: shortformJobIds,
                source_titles: omnibusJobs.map(j => j.issueTitle),
                video_path: storagePath,
                // 승인 절차 없이 바로 업로드 가능하도록 생성 즉시 'approved'로 기록
                approval_status: 'approved',
                // chapters는 별도 컬럼 없이 upload_status(jsonb)에 얹어 마이그레이션 없이 보관
                upload_status: { chapters },
            })
            .select('id')
            .single()

        if (insertError) {
            return { ok: false, error: 'INSERT_ERROR', message: '롱폼 job 기록 실패: ' + insertError.message, status: 500 }
        }

        await writeAdminLog(
            '롱폼 동영상 생성',
            'longform_job',
            jobRow.id as string,
            actorEmail,
            `이슈 ${shortformJobIds.length}개 → ${filename}`
        )

        return {
            ok: true,
            id: jobRow.id as string,
            path: storagePath,
            publicUrl: urlData.publicUrl,
            filename,
        }
    } catch (error) {
        console.error('[롱폼] 동영상 생성 에러:', error)
        const message = error instanceof Error ? error.message : '롱폼 동영상 생성 실패'
        return { ok: false, error: 'GENERATE_ERROR', message, status: 500 }
    }
}
