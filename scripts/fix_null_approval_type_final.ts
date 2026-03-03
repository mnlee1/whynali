/**
 * scripts/fix_null_approval_type_final.ts
 * 
 * 모든 approval_type null 이슈 최종 수정
 */

import { supabaseAdmin } from '../lib/supabase/server'

const AUTO_APPROVE_THRESHOLD = 30

async function main() {
    console.log('=== approval_type null 최종 수정 ===\n')

    // 승인/반려 상태인데 approval_type이 null인 모든 이슈
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .in('approval_status', ['승인', '반려'])
        .is('approval_type', null)

    if (!issues || issues.length === 0) {
        console.log('✅ 수정할 이슈가 없습니다.')
        return
    }

    console.log(`📋 수정 대상: ${issues.length}개\n`)

    for (const issue of issues) {
        const heat = issue.heat_index ?? 0
        const newType = heat >= AUTO_APPROVE_THRESHOLD ? 'auto' : 'manual'

        console.log(`${issue.title}`)
        console.log(`  상태: ${issue.approval_status} | 화력: ${heat}점`)
        console.log(`  → ${newType === 'auto' ? '자동' : '관리자'} ${issue.approval_status}\n`)

        await supabaseAdmin
            .from('issues')
            .update({ approval_type: newType })
            .eq('id', issue.id)
    }

    console.log(`✅ ${issues.length}개 이슈 수정 완료`)

    // 최종 확인
    const { count: approvedNull } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .is('approval_type', null)

    const { count: rejectedNull } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .is('approval_type', null)

    console.log(`\n[ 최종 확인 ]`)
    console.log(`승인 + null: ${approvedNull}개`)
    console.log(`반려 + null: ${rejectedNull}개`)
}

main().catch(console.error)
