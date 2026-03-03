/**
 * scripts/fix_low_heat_auto_approved.ts
 * 
 * 화력 30점 미만 자동 승인 이슈를 관리자 승인으로 변경
 */

import { supabaseAdmin } from '../lib/supabase/server'

const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30')

async function main() {
    console.log('=== 화력 30점 미만 자동 승인 이슈 수정 ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .eq('approval_status', '승인')
        .eq('approval_type', 'auto')
        .lt('heat_index', AUTO_APPROVE_THRESHOLD)

    if (!issues || issues.length === 0) {
        console.log('해당 이슈 없음')
        return
    }

    console.log(`대상 이슈: ${issues.length}개\n`)

    for (const issue of issues) {
        console.log(`[자동 승인 → 관리자 승인] 화력 ${issue.heat_index}점`)
        console.log(`  "${issue.title}"`)

        const { error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_type: 'manual',
                updated_at: new Date().toISOString(),
            })
            .eq('id', issue.id)

        if (error) {
            console.error(`  ❌ 업데이트 실패:`, error)
        } else {
            console.log(`  ✅ 완료`)
        }
        console.log()
    }

    console.log(`=== 수정 완료: ${issues.length}개 ===`)
}

main().catch(console.error)
