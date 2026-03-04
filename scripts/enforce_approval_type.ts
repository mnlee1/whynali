/**
 * scripts/enforce_approval_type.ts
 * 
 * 모든 승인/반려 이슈에 approval_type 강제 설정
 */

import { supabaseAdmin } from '../lib/supabase/server'

const AUTO_APPROVE_THRESHOLD = 30

async function main() {
    console.log('=== approval_type 강제 설정 ===\n')

    // 승인/반려 상태인데 approval_type이 null인 모든 이슈
    const { data: nullTypeIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .in('approval_status', ['승인', '반려'])
        .is('approval_type', null)

    if (!nullTypeIssues || nullTypeIssues.length === 0) {
        console.log('✅ 모든 이슈에 approval_type이 설정되어 있습니다.')
        return
    }

    console.log(`⚠️  approval_type이 없는 이슈 ${nullTypeIssues.length}개 발견\n`)

    for (const issue of nullTypeIssues) {
        const heat = issue.heat_index ?? 0
        // 화력 30점 이상이면 자동, 아니면 수동
        const newType = heat >= AUTO_APPROVE_THRESHOLD ? 'auto' : 'manual'

        console.log(`${issue.title}`)
        console.log(`  ${issue.approval_status} (화력 ${heat}점) → ${newType === 'auto' ? '자동' : '관리자'} ${issue.approval_status}`)

        await supabaseAdmin
            .from('issues')
            .update({ approval_type: newType })
            .eq('id', issue.id)
    }

    console.log(`\n✅ ${nullTypeIssues.length}개 이슈에 approval_type 설정 완료`)

    // 최종 확인
    const { count } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .in('approval_status', ['승인', '반려'])
        .is('approval_type', null)

    console.log(`\n[ 최종 확인 ]`)
    console.log(`approval_type이 null인 승인/반려 이슈: ${count}개`)
    
    if (count === 0) {
        console.log('✅ 모든 이슈가 4가지 옵션 중 하나로 분류되었습니다.')
        console.log('   - 자동 승인 / 관리자 승인 / 자동 반려 / 관리자 반려')
    }
}

main().catch(console.error)
