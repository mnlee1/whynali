/**
 * app/api/cron/auto-create-issue/route.ts
 *
 * [이슈 후보 자동 생성 Cron]
 *
 * 30분마다 실행되며 수집된 뉴스·커뮤니티 데이터를 분석해
 * 07_이슈등록_화력_정렬_규격 §1 조건에 따라 이슈를 자동 생성합니다.
 *
 * 추가 기능:
 * - 긴급 이슈 타임아웃 자동 승인 (연예/정치 카테고리 화력 높은 대기 이슈)
 *
 * GitHub Actions에서 호출: .github/workflows/cron-auto-create-issue.yml
 */

import { NextRequest, NextResponse } from 'next/server'
import { evaluateCandidates } from '@/lib/candidate/issue-candidate'
import { verifyCronRequest } from '@/lib/cron-auth'
import { clearCandidatesCache } from '@/lib/cache/candidates-cache'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * autoApproveUrgentIssues - 긴급 이슈 타임아웃 자동 승인
 * 
 * 조건: approval_status='대기' AND is_urgent=true AND created_at < N시간 전
 * 처리: approval_status='승인', approval_type='auto', approved_at=now()
 * 
 * 환경변수:
 * - URGENT_AUTO_APPROVE_HOURS: 타임아웃 기준 (기본 2시간)
 */
async function autoApproveUrgentIssues(): Promise<{ count: number; issues: string[] }> {
    const timeoutHours = parseInt(process.env.URGENT_AUTO_APPROVE_HOURS ?? '2')
    const cutoffTime = new Date(Date.now() - timeoutHours * 60 * 60 * 1000).toISOString()
    
    const { data: urgentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index')
        .eq('approval_status', '대기')
        .eq('is_urgent', true)
        .lt('created_at', cutoffTime)
    
    if (!urgentIssues || urgentIssues.length === 0) {
        return { count: 0, issues: [] }
    }
    
    const approvedTitles: string[] = []
    const now = new Date().toISOString()
    
    for (const issue of urgentIssues) {
        const { error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '승인',
                approval_type: 'auto',
                approved_at: now,
            })
            .eq('id', issue.id)
        
        if (!error) {
            console.log(
                `[긴급 자동승인] ${issue.title} ` +
                `(카테고리: ${issue.category}, 화력: ${issue.heat_index ?? '?'}점, 대기시간: ${timeoutHours}시간+)`
            )
            approvedTitles.push(issue.title)
        }
    }
    
    return { count: approvedTitles.length, issues: approvedTitles }
}

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        clearCandidatesCache()
        
        const startTime = Date.now()
        
        const urgentApprovalResult = await autoApproveUrgentIssues()
        
        const result = await evaluateCandidates()
        const elapsed = Date.now() - startTime

        return NextResponse.json({
            success: true,
            created: result.created,
            alerts: result.alerts.length,
            alertDetails: result.alerts,
            evaluated: result.evaluated,
            urgentApproved: urgentApprovalResult.count,
            urgentApprovedIssues: urgentApprovalResult.issues,
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('이슈 후보 자동 생성 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'AUTO_CREATE_ERROR',
                message: '이슈 자동 생성 실패',
            },
            { status: 500 }
        )
    }
}
