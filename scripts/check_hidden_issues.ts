import { supabaseAdmin } from '../lib/supabase/server'

async function checkHiddenIssues() {
    console.log('=== 목록에 안 나오는 숨겨진 이슈 진단 ===\n')

    // 1. 임시 이슈 (approval_status is null)
    const { data: nullStatusIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, created_at, heat_index')
        .is('approval_status', null)
        .order('created_at', { ascending: false })
        .limit(10)

    console.log(`[1] 상태가 NULL인 임시 이슈 (처리 중 오류난 항목): ${nullStatusIssues?.length || 0}건`)
    nullStatusIssues?.forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue.title.slice(0, 50)}`)
        console.log(`     생성: ${issue.created_at} | 화력: ${issue.heat_index || 0}점`)
    })

    // 2. 화력 부족으로 숨겨진 이슈 (heat_index < 10)
    const { data: lowHeatIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, created_at, heat_index')
        .not('approval_status', 'is', null)
        .lt('heat_index', 10) // 현재 최소 화력 기준
        .order('created_at', { ascending: false })
        .limit(10)

    console.log(`\n[2] 화력 부족(10점 미만)으로 목록에서 숨겨진 이슈: ${lowHeatIssues?.length || 0}건`)
    lowHeatIssues?.forEach((issue, i) => {
        console.log(`  ${i+1}. [${issue.approval_status}] ${issue.title.slice(0, 50)}`)
        console.log(`     생성: ${issue.created_at} | 화력: ${issue.heat_index || 0}점`)
    })
    
    // 3. 전체 이슈 개수 비교
    const { count: totalCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        
    const { count: visibleCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .not('approval_status', 'is', null)
        .gte('heat_index', 10)
        
    console.log(`\n[통계]`)
    console.log(`  DB 전체 이슈: ${totalCount}건`)
    console.log(`  관리자 화면 노출 이슈: ${visibleCount}건`)
    console.log(`  → 숨겨진 이슈 총: ${(totalCount || 0) - (visibleCount || 0)}건`)
}

checkHiddenIssues().catch(console.error)
