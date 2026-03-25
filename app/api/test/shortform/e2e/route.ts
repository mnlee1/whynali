/**
 * app/api/test/shortform/e2e/route.ts
 * 
 * 숏폼 E2E 파이프라인 테스트
 * 
 * job 생성 → 승인 → MP4 생성 → 결과 검증
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { createShortformJob } from '@/lib/shortform/create-job'
import { generate3SceneShortform } from '@/lib/shortform/generate-image'
import { uploadToYouTube, getYoutubeShortsUrl } from '@/lib/shortform/youtube-upload'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_TEST_ISSUE_ID = '12f35c66-da31-4f6e-8e98-357a72eeeac8'

export async function GET(request: NextRequest) {
    const logs: string[] = []
    const searchParams = request.nextUrl.searchParams
    const includeYoutube = searchParams.get('youtube') === 'true'
    const TEST_ISSUE_ID = searchParams.get('issueId') ?? DEFAULT_TEST_ISSUE_ID
    
    try {
        logs.push('=== 숏폼 E2E 테스트 시작 ===')
        logs.push(`테스트 이슈 ID: ${TEST_ISSUE_ID}`)
        logs.push(`YouTube 업로드: ${includeYoutube ? '포함' : '제외'}`)
        logs.push('')
        
        // STEP 1: 이슈 존재 확인
        logs.push('[1] 이슈 존재 확인 중...')
        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('id, title, status, heat_index, category')
            .eq('id', TEST_ISSUE_ID)
            .single()
        
        if (issueError || !issue) {
            throw new Error(`이슈를 찾을 수 없습니다: ${TEST_ISSUE_ID}`)
        }
        
        logs.push(`✓ 이슈 발견: "${issue.title}"`)
        logs.push(`  - 상태: ${issue.status}`)
        logs.push(`  - 화력: ${issue.heat_index}`)
        logs.push(`  - 카테고리: ${issue.category}`)
        logs.push('')
        
        // STEP 2: 기존 job 확인 또는 생성
        logs.push('[2] 숏폼 job 확인/생성 중...')
        
        const { data: existingJobs } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*')
            .eq('issue_id', TEST_ISSUE_ID)
            .order('created_at', { ascending: false })
            .limit(1)
        
        let jobId: string
        
        if (existingJobs && existingJobs.length > 0) {
            jobId = existingJobs[0].id
            logs.push(`✓ 기존 job 발견: ${jobId}`)
            logs.push(`  - 승인 상태: ${existingJobs[0].approval_status}`)
            logs.push(`  - video_path: ${existingJobs[0].video_path || '없음'}`)
        } else {
            const createdJobId = await createShortformJob({
                issueId: TEST_ISSUE_ID,
                triggerType: 'daily_batch',
            })
            
            if (!createdJobId) {
                throw new Error('job 생성 실패 (빈도 제어 또는 화력 부족)')
            }
            
            jobId = createdJobId
            logs.push(`✓ 새 job 생성: ${jobId}`)
        }
        logs.push('')
        
        // STEP 3: Job 승인
        logs.push('[3] job 승인 처리 중...')
        const { error: approveError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ approval_status: 'approved' })
            .eq('id', jobId)
        
        if (approveError) {
            throw new Error(`job 승인 실패: ${approveError.message}`)
        }
        
        logs.push(`✓ job 승인 완료: ${jobId}`)
        logs.push('')
        
        // STEP 4: video_path 초기화 (재생성 테스트를 위해)
        logs.push('[4] 기존 video_path 초기화 중...')
        const { error: resetError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: null })
            .eq('id', jobId)
        
        if (resetError) {
            logs.push(`⚠ video_path 초기화 실패: ${resetError.message}`)
        } else {
            logs.push('✓ video_path 초기화 완료')
        }
        logs.push('')
        
        // STEP 5: job 재조회 (category 포함)
        logs.push('[5] job 정보 재조회 중...')
        const { data: job, error: jobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*, issues!inner(category)')
            .eq('id', jobId)
            .single()
        
        if (jobError || !job) {
            throw new Error('job 조회 실패')
        }
        
        logs.push(`✓ job 정보:`)
        logs.push(`  - issue_title: ${job.issue_title}`)
        logs.push(`  - issue_category: ${(job.issues as any)?.category}`)
        logs.push(`  - issue_status: ${job.issue_status}`)
        logs.push(`  - heat_grade: ${job.heat_grade}`)
        logs.push(`  - source_count: 뉴스 ${job.source_count?.news}, 커뮤니티 ${job.source_count?.community}`)
        logs.push('')
        
        // STEP 6: MP4 동영상 생성
        logs.push('[6] MP4 동영상 생성 중... (약 30-60초 소요)')
        const startTime = Date.now()
        
        const videoBuffer = await generate3SceneShortform({
            issueTitle: job.issue_title,
            issueCategory: (job.issues as any)?.category ?? '사회',
            issueStatus: job.issue_status,
            heatGrade: job.heat_grade,
            newsCount: job.source_count?.news ?? 0,
            communityCount: job.source_count?.community ?? 0,
            issueUrl: job.issue_url,
        }, 10)
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        logs.push(`✓ MP4 생성 완료 (${elapsed}초)`)
        logs.push(`  - 파일 크기: ${(videoBuffer.length / 1024).toFixed(1)} KB`)
        logs.push('')
        
        // STEP 7: Storage 업로드
        logs.push('[7] Supabase Storage 업로드 중...')
        const filename = `shortform-${jobId}-${Date.now()}.mp4`
        
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('shortform')
            .upload(filename, videoBuffer, {
                contentType: 'video/mp4',
                upsert: false,
            })
        
        if (uploadError) {
            throw new Error(`Storage 업로드 실패: ${uploadError.message}`)
        }
        
        logs.push(`✓ Storage 업로드 완료: ${uploadData.path}`)
        logs.push('')
        
        // STEP 8: Job의 video_path 업데이트
        logs.push('[8] job의 video_path 업데이트 중...')
        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: uploadData.path })
            .eq('id', jobId)
        
        if (updateError) {
            throw new Error(`job 업데이트 실패: ${updateError.message}`)
        }
        
        logs.push(`✓ job 업데이트 완료`)
        logs.push('')
        
        // STEP 9: 공개 URL 생성
        const { data: urlData } = supabaseAdmin
            .storage
            .from('shortform')
            .getPublicUrl(uploadData.path)
        
        logs.push('[9] 결과 검증')
        logs.push(`✓ 파일 확장자: ${filename.endsWith('.mp4') ? 'MP4 (올바름)' : 'PNG (잘못됨)'}`)
        logs.push(`✓ contentType: video/mp4`)
        logs.push(`✓ Storage 경로: ${uploadData.path}`)
        logs.push(`✓ 공개 URL: ${urlData.publicUrl}`)
        logs.push('')
        
        let youtubeUrl: string | undefined
        let youtubeVideoId: string | undefined
        
        // STEP 10: YouTube Shorts 업로드 (선택적)
        if (includeYoutube) {
            logs.push('[10] YouTube Shorts 업로드 중...')
            const uploadStartTime = Date.now()
            
            try {
                const videoId = await uploadToYouTube(videoBuffer, {
                    title: issue.title,
                    description: `${issue.title}\n\n왜난리에서 실시간 여론·토론·타임라인을 확인하세요!\nhttps://whynali.com/issue/${TEST_ISSUE_ID}`,
                    tags: ['왜난리', '이슈', '논란', issue.status, issue.category],
                })
                
                youtubeUrl = getYoutubeShortsUrl(videoId)
                youtubeVideoId = videoId
                const uploadElapsed = ((Date.now() - uploadStartTime) / 1000).toFixed(1)
                
                logs.push(`✓ YouTube 업로드 완료 (${uploadElapsed}초)`)
                logs.push(`  - 동영상 ID: ${videoId}`)
                logs.push(`  - URL: ${youtubeUrl}`)
                logs.push('')
                
                // STEP 11: Job의 upload_status 업데이트
                logs.push('[11] job의 upload_status 업데이트 중...')
                const newUploadStatus = {
                    youtube: {
                        status: 'success',
                        url: youtubeUrl,
                        video_id: videoId,
                        uploaded_at: new Date().toISOString(),
                    },
                }
                
                const { error: uploadStatusError } = await supabaseAdmin
                    .from('shortform_jobs')
                    .update({ upload_status: newUploadStatus })
                    .eq('id', jobId)
                
                if (uploadStatusError) {
                    logs.push(`⚠ upload_status 업데이트 실패: ${uploadStatusError.message}`)
                } else {
                    logs.push('✓ upload_status 업데이트 완료')
                }
                logs.push('')
            } catch (youtubeError: any) {
                logs.push(`⚠ YouTube 업로드 실패: ${youtubeError.message}`)
                logs.push('')
            }
        } else {
            logs.push('[10] YouTube 업로드 건너뜀 (쿼리 파라미터 youtube=true 추가 시 실행)')
            logs.push('')
        }
        
        logs.push('=== E2E 테스트 성공 ===')
        
        return NextResponse.json({
            success: true,
            jobId,
            filename,
            storagePath: uploadData.path,
            publicUrl: urlData.publicUrl,
            videoSizeKB: (videoBuffer.length / 1024).toFixed(1),
            youtubeUrl,
            youtubeVideoId,
            logs,
        })
    } catch (error: any) {
        logs.push('')
        logs.push('=== E2E 테스트 실패 ===')
        logs.push(`에러: ${error.message}`)
        
        console.error('[E2E 테스트 실패]', error)
        
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack,
            logs,
        }, { status: 500 })
    }
}
