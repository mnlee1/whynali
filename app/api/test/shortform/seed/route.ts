/**
 * app/api/test/shortform/seed/route.ts
 *
 * [테스트 전용 - 숏폼 job 강제 생성 seed 엔드포인트]
 *
 * createShortformJob의 화력 등급 필터·쿨다운 체크를 우회하여
 * shortform_jobs 테이블에 직접 INSERT한다.
 *
 * TODO: 프로덕션 배포 전 이 엔드포인트 제거 또는 requireAdmin 인증 추가 필요
 *
 * 요청 예시:
 *   GET /api/test/shortform/seed?issueIds=ISSUE_ID_1,ISSUE_ID_2
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { HeatGrade, ShortformSourceCount } from '@/types/shortform'

export const dynamic = 'force-dynamic'

function calcHeatGrade(heatIndex: number | null): HeatGrade {
    if (heatIndex === null) return '낮음'
    if (heatIndex >= 60) return '높음'
    if (heatIndex >= 30) return '보통'
    return '낮음'
}

export async function GET(request: NextRequest) {
    const issueIdsParam = request.nextUrl.searchParams.get('issueIds')

    if (!issueIdsParam) {
        return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'issueIds 쿼리 파라미터가 필요합니다. 예: ?issueIds=ID1,ID2' },
            { status: 400 }
        )
    }

    const issueIds = issueIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)

    if (issueIds.length === 0) {
        return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'issueIds에 유효한 ID가 없습니다' },
            { status: 400 }
        )
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'
    const results: Array<{
        issueId: string
        status: 'created' | 'skipped' | 'error'
        jobId?: string
        reason?: string
    }> = []

    for (const issueId of issueIds) {
        try {
            // 이슈 정보 조회
            const { data: issue, error: issueError } = await supabaseAdmin
                .from('issues')
                .select('id, title, status, heat_index, category')
                .eq('id', issueId)
                .single()

            if (issueError || !issue) {
                results.push({ issueId, status: 'error', reason: `이슈를 찾을 수 없습니다: ${issueId}` })
                continue
            }

            // 중복 job 확인 (pending/approved 상태)
            const { data: existingJobs } = await supabaseAdmin
                .from('shortform_jobs')
                .select('id')
                .eq('issue_id', issueId)
                .in('approval_status', ['pending', 'approved'])
                .limit(1)

            if (existingJobs && existingJobs.length > 0) {
                results.push({ issueId, status: 'skipped', reason: '이미 pending/approved job이 존재합니다', jobId: existingJobs[0].id })
                continue
            }

            // 뉴스 출처 개수 조회
            const { count: newsCount } = await supabaseAdmin
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issueId)

            // community_data 개수 조회 (테이블 없을 경우 0 처리)
            let communityCount = 0
            try {
                const { count } = await supabaseAdmin
                    .from('community_data')
                    .select('*', { count: 'exact', head: true })
                    .eq('issue_id', issueId)
                communityCount = count ?? 0
            } catch {
                communityCount = 0
            }

            const sourceCount: ShortformSourceCount = {
                news: newsCount ?? 0,
                community: communityCount,
            }

            const heatGrade = calcHeatGrade(issue.heat_index)
            const issueUrl = `${siteUrl}/issue/${issueId}`

            // issue_status CHECK 제약: '점화' | '논란중' | '종결' 만 허용
            // 그 외 상태('대기', '승인' 등)는 테스트용으로 '점화'로 강제 지정
            const allowedStatuses = ['점화', '논란중', '종결']
            const issueStatus = allowedStatuses.includes(issue.status) ? issue.status : '점화'

            // shortform_jobs에 직접 INSERT (필터·쿨다운 우회)
            // trigger_type CHECK 제약: 'issue_created' | 'status_changed' 만 허용 ('daily_batch' 없음)
            const { data: job, error: insertError } = await supabaseAdmin
                .from('shortform_jobs')
                .insert({
                    issue_id: issueId,
                    issue_title: issue.title,
                    issue_status: issueStatus,
                    heat_grade: heatGrade,
                    source_count: sourceCount,
                    issue_url: issueUrl,
                    trigger_type: 'issue_created',
                    approval_status: 'pending',
                })
                .select('id')
                .single()

            if (insertError || !job) {
                results.push({ issueId, status: 'error', reason: `DB INSERT 실패: ${insertError?.message}` })
                continue
            }

            results.push({ issueId, status: 'created', jobId: job.id })
        } catch (err) {
            const message = err instanceof Error ? err.message : '알 수 없는 오류'
            results.push({ issueId, status: 'error', reason: message })
        }
    }

    const created = results.filter((r) => r.status === 'created').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errored = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
        summary: { total: issueIds.length, created, skipped, errored },
        results,
    })
}
