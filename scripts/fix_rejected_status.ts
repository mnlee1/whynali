/**
 * scripts/fix_rejected_status.ts
 * 
 * 반려 이슈의 status를 '종결'로 강제 변경
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 반려 이슈 status 수정 시작 ===\n')

    // 반려 상태인데 status가 종결이 아닌 이슈들 조회
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index')
        .eq('approval_status', '반려')
        .neq('status', '종결')

    if (error) {
        console.error('조회 에러:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('✅ 수정할 이슈가 없습니다.')
        return
    }

    console.log(`📋 수정 대상: ${issues.length}개`)
    console.log('\n[ 수정 전 상태 ]\n')
    issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title}`)
        console.log(`   approval: ${issue.approval_status} | status: ${issue.status} | heat: ${issue.heat_index}`)
    })

    // 일괄 업데이트
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({ status: '종결' })
        .eq('approval_status', '반려')
        .neq('status', '종결')

    if (updateError) {
        console.error('\n❌ 업데이트 에러:', updateError)
        return
    }

    console.log(`\n✅ ${issues.length}개 이슈의 status를 '종결'로 변경했습니다.`)

    // 최종 확인
    const { count: remainCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .neq('status', '종결')

    console.log(`\n[ 최종 확인 ]`)
    console.log(`반려 상태인데 status가 종결이 아닌 이슈: ${remainCount}개`)
}

main().catch(console.error)
