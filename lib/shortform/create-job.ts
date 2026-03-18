/**
 * lib/shortform/create-job.ts
 * 
 * 숏폼 job 생성 서비스
 * 
 * 이슈 메타데이터를 받아서 shortform_jobs 테이블에 등록한다.
 * 본문 요약은 절대 사용하지 않으며, 이슈 메타데이터(제목, 상태, 화력, 출처 수, URL)만 사용한다.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import type { ShortformTriggerType, HeatGrade, ShortformSourceCount } from '@/types/shortform'

export interface CreateShortformJobInput {
    issueId: string
    triggerType: ShortformTriggerType
}

/**
 * 화력 지수를 화력 등급으로 변환
 * 
 * @param heatIndex - 화력 지수 (0~100+)
 * @returns 화력 등급 ('높음' | '보통' | '낮음')
 */
function convertHeatGrade(heatIndex: number | null): HeatGrade {
    if (heatIndex === null) return '낮음'
    if (heatIndex >= 60) return '높음'
    if (heatIndex >= 30) return '보통'
    return '낮음'
}

/**
 * 숏폼 job 생성
 * 
 * 1. issues 테이블에서 id, title, status, heat_index 가져오기
 * 2. news_data / community_data에서 각 count 가져오기
 * 3. shortform_jobs에 INSERT 후 생성된 job id 반환
 * 
 * @param input - 이슈 ID 및 트리거 타입
 * @returns 생성된 job ID
 * @throws 이슈가 존재하지 않거나 DB 에러 발생 시
 */
export async function createShortformJob(input: CreateShortformJobInput): Promise<string> {
    const { issueId, triggerType } = input

    // 1. 이슈 정보 조회
    const { data: issue, error: issueError } = await supabaseAdmin
        .from('issues')
        .select('id, title, status, heat_index')
        .eq('id', issueId)
        .single()

    if (issueError || !issue) {
        throw new Error(`이슈를 찾을 수 없습니다: ${issueId}`)
    }

    // 2. 출처 개수 조회
    const { count: newsCount, error: newsError } = await supabaseAdmin
        .from('news_data')
        .select('*', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    const { count: communityCount, error: communityError } = await supabaseAdmin
        .from('community_data')
        .select('*', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    if (newsError || communityError) {
        throw new Error('출처 개수 조회 실패')
    }

    const sourceCount: ShortformSourceCount = {
        news: newsCount ?? 0,
        community: communityCount ?? 0,
    }

    // 3. 화력 등급 변환
    const heatGrade = convertHeatGrade(issue.heat_index)

    // 4. 이슈 URL 생성
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'
    const issueUrl = `${siteUrl}/issue/${issueId}`

    // 5. shortform_jobs에 INSERT
    const { data: job, error: insertError } = await supabaseAdmin
        .from('shortform_jobs')
        .insert({
            issue_id: issueId,
            issue_title: issue.title,
            issue_status: issue.status,
            heat_grade: heatGrade,
            source_count: sourceCount,
            issue_url: issueUrl,
            trigger_type: triggerType,
            approval_status: 'pending',
        })
        .select('id')
        .single()

    if (insertError || !job) {
        throw new Error('숏폼 job 생성 실패')
    }

    return job.id
}
