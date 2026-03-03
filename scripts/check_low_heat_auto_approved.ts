/**
 * scripts/check_low_heat_auto_approved.ts
 * 
 * 화력 낮은데 자동 승인된 이슈 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 화력 30점 미만 자동 승인 이슈 확인 ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, created_at, approved_at, updated_at')
        .eq('approval_status', '승인')
        .eq('approval_type', 'auto')
        .lt('heat_index', 30)
        .order('heat_index', { ascending: false })

    if (!issues || issues.length === 0) {
        console.log('해당 이슈 없음')
        return
    }

    console.log(`총 ${issues.length}개 이슈:\n`)

    for (const issue of issues) {
        console.log(`[화력 ${issue.heat_index}점] ${issue.title}`)
        console.log(`  - 생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`  - 승인일: ${issue.approved_at ? new Date(issue.approved_at).toLocaleString('ko-KR') : 'null'}`)
        console.log(`  - 수정일: ${new Date(issue.updated_at).toLocaleString('ko-KR')}`)
        
        // 연결된 뉴스/커뮤니티 확인
        const { count: newsCount } = await supabaseAdmin
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        const { count: communityCount } = await supabaseAdmin
            .from('community_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        console.log(`  - 뉴스: ${newsCount}건, 커뮤니티: ${communityCount}건`)
        console.log()
    }

    console.log('\n=== 분석 ===')
    console.log('이 이슈들은 이전 기준(MIN_HEAT_TO_REGISTER=15)으로 자동 승인되었을 가능성이 높습니다.')
    console.log('현재 기준(30점)으로 재평가하려면 approval_type을 "manual"로 변경해야 합니다.')
    console.log('\n다음 옵션 중 선택:')
    console.log('1. 그대로 유지 (이미 승인된 이슈는 건드리지 않음)')
    console.log('2. "관리자 승인"으로 변경 (화력 30점 미만은 자동이 아니라는 규칙 적용)')
}

main().catch(console.error)
