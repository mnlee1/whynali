/**
 * scripts/fix_approval_types.ts
 * 
 * approval_type이 null인 승인된 이슈들의 타입을 설정
 * - 화력 30점 이상: 자동 승인
 * - 화력 30점 미만: 관리자 승인 (기존에 관리자가 승인한 것으로 간주)
 */

import { supabaseAdmin } from '../lib/supabase/server'

const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30')

async function main() {
    console.log('=== approval_type 설정 시작 ===\n')

    // approval_type이 null인 승인/반려 이슈 조회
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .is('approval_type', null)
        .in('approval_status', ['승인', '반려'])
        .order('created_at', { ascending: false })

    if (error || !issues) {
        console.error('이슈 조회 실패:', error)
        return
    }

    console.log(`대상 이슈: ${issues.length}개\n`)

    const stats = {
        autoApproved: 0,
        manualApproved: 0,
        autoRejected: 0,
        manualRejected: 0,
    }

    for (const issue of issues) {
        const heat = issue.heat_index ?? 0
        let newType: 'auto' | 'manual'

        if (issue.approval_status === '승인') {
            // 화력 30점 이상이면 자동 승인, 미만이면 관리자 승인
            if (heat >= AUTO_APPROVE_THRESHOLD) {
                newType = 'auto'
                stats.autoApproved++
                console.log(`[자동 승인] 화력 ${heat}점 | "${issue.title.substring(0, 50)}"`)
            } else {
                newType = 'manual'
                stats.manualApproved++
                console.log(`[관리자 승인] 화력 ${heat}점 | "${issue.title.substring(0, 50)}"`)
            }
        } else {
            // 반려는 화력 10점 미만이면 자동 반려, 이상이면 관리자 반려
            if (heat < 10) {
                newType = 'auto'
                stats.autoRejected++
                console.log(`[자동 반려] 화력 ${heat}점 | "${issue.title.substring(0, 50)}"`)
            } else {
                newType = 'manual'
                stats.manualRejected++
                console.log(`[관리자 반려] 화력 ${heat}점 | "${issue.title.substring(0, 50)}"`)
            }
        }

        // approval_type 업데이트
        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                approval_type: newType,
                updated_at: new Date().toISOString(),
            })
            .eq('id', issue.id)

        if (updateError) {
            console.error(`업데이트 실패 (${issue.id}):`, updateError)
        }
    }

    console.log('\n=== 완료 ===')
    console.log(`총 ${issues.length}개 이슈 처리:`)
    console.log(`  - 자동 승인: ${stats.autoApproved}개`)
    console.log(`  - 관리자 승인: ${stats.manualApproved}개`)
    console.log(`  - 자동 반려: ${stats.autoRejected}개`)
    console.log(`  - 관리자 반려: ${stats.manualRejected}개`)
}

main().catch(console.error)
