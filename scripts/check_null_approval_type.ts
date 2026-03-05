/**
 * scripts/check_null_approval_type.ts
 * 
 * approval_type이 null인 승인/반려 이슈 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== approval_type null 이슈 확인 ===\n')

    // 승인 상태인데 approval_type이 null
    const { data: approvedNull } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, created_at')
        .eq('approval_status', '승인')
        .is('approval_type', null)
        .order('created_at', { ascending: false })

    // 반려 상태인데 approval_type이 null
    const { data: rejectedNull } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, created_at')
        .eq('approval_status', '반려')
        .is('approval_type', null)
        .order('created_at', { ascending: false })

    console.log(`[ 승인 상태 + approval_type null ]\n`)
    if (approvedNull && approvedNull.length > 0) {
        console.log(`총 ${approvedNull.length}개\n`)
        approvedNull.slice(0, 10).forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점 | 생성: ${new Date(issue.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`)
        })
        if (approvedNull.length > 10) {
            console.log(`... 외 ${approvedNull.length - 10}개`)
        }
    } else {
        console.log('없음')
    }

    console.log(`\n[ 반려 상태 + approval_type null ]\n`)
    if (rejectedNull && rejectedNull.length > 0) {
        console.log(`총 ${rejectedNull.length}개\n`)
        rejectedNull.slice(0, 10).forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점 | 생성: ${new Date(issue.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`)
        })
        if (rejectedNull.length > 10) {
            console.log(`... 외 ${rejectedNull.length - 10}개`)
        }
    } else {
        console.log('없음')
    }
}

main().catch(console.error)
