/**
 * scripts/reapply_current_standards.ts
 * 
 * 현재 기준으로 모든 이슈 재평가
 */

import { supabaseAdmin } from '../lib/supabase/server'

const MIN_HEAT_TO_REGISTER = 10
const AUTO_APPROVE_THRESHOLD = 30

async function main() {
    console.log('=== 현재 기준으로 이슈 재평가 ===\n')
    console.log(`기준:`)
    console.log(`- 화력 < ${MIN_HEAT_TO_REGISTER}점: 반려`)
    console.log(`- 화력 ${MIN_HEAT_TO_REGISTER}-${AUTO_APPROVE_THRESHOLD-1}점: 대기 또는 수동 승인 유지`)
    console.log(`- 화력 ≥ ${AUTO_APPROVE_THRESHOLD}점: 자동 승인 (사회/기술/스포츠)\n`)

    // 최근 7일 이내 이슈만 재평가
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: allIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, category, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('heat_index', { ascending: true })

    if (!allIssues || allIssues.length === 0) {
        console.log('처리할 이슈가 없습니다.')
        return
    }

    console.log(`총 ${allIssues.length}개 이슈 검토 중...\n`)

    let rejectedCount = 0
    let keptCount = 0
    let autoApprovedCount = 0

    for (const issue of allIssues) {
        const heat = issue.heat_index ?? 0

        // 1. 화력 10점 미만 → 반려 (승인/대기 상태였던 것만)
        if (heat < MIN_HEAT_TO_REGISTER && issue.approval_status !== '반려') {
            await supabaseAdmin
                .from('issues')
                .update({
                    approval_status: '반려',
                    approval_type: 'auto'
                })
                .eq('id', issue.id)

            console.log(`❌ 반려: ${issue.title}`)
            console.log(`   화력 ${heat}점 < ${MIN_HEAT_TO_REGISTER}점\n`)
            rejectedCount++
        }
        // 2. 화력 30점 이상 + 허용 카테고리 → 자동 승인
        else if (heat >= AUTO_APPROVE_THRESHOLD && 
                 ['사회', '기술', '스포츠'].includes(issue.category) &&
                 issue.approval_status === '대기') {
            await supabaseAdmin
                .from('issues')
                .update({
                    approval_status: '승인',
                    approval_type: 'auto',
                    approved_at: new Date().toISOString()
                })
                .eq('id', issue.id)

            console.log(`✅ 자동 승인: ${issue.title}`)
            console.log(`   화력 ${heat}점, 카테고리: ${issue.category}\n`)
            autoApprovedCount++
        }
        // 3. 나머지는 현재 상태 유지
        else {
            keptCount++
        }
    }

    console.log(`\n[ 결과 요약 ]`)
    console.log(`반려 처리: ${rejectedCount}개`)
    console.log(`자동 승인: ${autoApprovedCount}개`)
    console.log(`현상 유지: ${keptCount}개`)

    // 최종 통계
    const { count: approvedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .gte('created_at', sevenDaysAgo)

    const { count: pendingCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '대기')
        .gte('created_at', sevenDaysAgo)

    const { count: rejectedTotalCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .gte('created_at', sevenDaysAgo)

    console.log(`\n[ 최근 7일 이슈 현황 ]`)
    console.log(`승인: ${approvedCount}개`)
    console.log(`대기: ${pendingCount}개`)
    console.log(`반려: ${rejectedTotalCount}개`)
}

main().catch(console.error)
