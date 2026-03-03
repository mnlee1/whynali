/**
 * scripts/restore_rejected_status.ts
 * 
 * 반려 이슈의 status를 원래 상태('점화')로 복구
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 반려 이슈 status 복구 시작 ===\n')

    // 반려 상태인데 status가 종결인 이슈들 조회
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index, created_at')
        .eq('approval_status', '반려')
        .eq('status', '종결')

    if (error) {
        console.error('조회 에러:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('✅ 복구할 이슈가 없습니다.')
        return
    }

    console.log(`📋 복구 대상: ${issues.length}개`)
    console.log('\n[ 복구 전 상태 ]\n')
    issues.slice(0, 10).forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title}`)
        console.log(`   approval: ${issue.approval_status} | status: ${issue.status} | heat: ${issue.heat_index}`)
    })
    if (issues.length > 10) {
        console.log(`... 외 ${issues.length - 10}개`)
    }

    // 일괄 업데이트: 종결 → 점화
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({ status: '점화' })
        .eq('approval_status', '반려')
        .eq('status', '종결')

    if (updateError) {
        console.error('\n❌ 업데이트 에러:', updateError)
        return
    }

    console.log(`\n✅ ${issues.length}개 이슈의 status를 '점화'로 복구했습니다.`)
    console.log('\n💡 다음 Cron 실행 시 조건에 따라 자동으로 status가 전환됩니다:')
    console.log('   - 6시간 경과 + 화력 < 10점 → 종결 (바이패스)')
    console.log('   - 24시간 경과 + 화력 < 30점 → 종결 (타임아웃)')
    console.log('   - 6시간 경과 + 화력 ≥ 30점 + 커뮤니티 1건 → 논란중')

    // 최종 확인
    const { count: igniteCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .eq('status', '점화')

    const { count: closedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .eq('status', '종결')

    console.log(`\n[ 최종 확인 ]`)
    console.log(`반려 + 점화: ${igniteCount}개`)
    console.log(`반려 + 종결: ${closedCount}개`)
}

main().catch(console.error)
