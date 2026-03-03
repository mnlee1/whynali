/**
 * scripts/fix_remaining_null_approval_type.ts
 * 
 * 남은 approval_type null 이슈 수정
 */

import { supabaseAdmin } from '../lib/supabase/server'

const AUTO_APPROVE_THRESHOLD = 30

async function main() {
    console.log('=== approval_type null 이슈 수정 ===\n')

    // 승인 상태인데 approval_type이 null
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .eq('approval_status', '승인')
        .is('approval_type', null)

    if (!issues || issues.length === 0) {
        console.log('✅ 수정할 이슈가 없습니다.')
        return
    }

    console.log(`📋 수정 대상: ${issues.length}개\n`)

    let autoCount = 0
    let manualCount = 0

    for (const issue of issues) {
        const heat = issue.heat_index ?? 0
        const newType = heat >= AUTO_APPROVE_THRESHOLD ? 'auto' : 'manual'

        await supabaseAdmin
            .from('issues')
            .update({ approval_type: newType })
            .eq('id', issue.id)

        if (newType === 'auto') {
            autoCount++
        } else {
            manualCount++
        }
    }

    console.log(`✅ 수정 완료:`)
    console.log(`   자동 승인: ${autoCount}개 (화력 ${AUTO_APPROVE_THRESHOLD}점 이상)`)
    console.log(`   관리자 승인: ${manualCount}개 (화력 ${AUTO_APPROVE_THRESHOLD}점 미만)`)

    // 최종 확인
    const { count } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .is('approval_type', null)

    console.log(`\n[ 최종 확인 ]`)
    console.log(`승인 상태 + approval_type null: ${count}개`)
}

main().catch(console.error)
