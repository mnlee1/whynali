/**
 * scripts/check_specific_issues.ts
 * 
 * 특정 이슈의 approval_type 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 특정 이슈 확인 ===\n')

    const titles = [
        '1억 공천헌금',
        'KT, MWC 2026'
    ]

    for (const keyword of titles) {
        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, approval_type, heat_index, created_at')
            .ilike('title', `%${keyword}%`)
            .order('created_at', { ascending: false })
            .limit(5)

        console.log(`[ "${keyword}" 검색 결과 ]\n`)
        if (issues && issues.length > 0) {
            issues.forEach((issue, idx) => {
                console.log(`${idx + 1}. ${issue.title}`)
                console.log(`   승인상태: ${issue.approval_status}`)
                console.log(`   승인타입: ${issue.approval_type ?? 'null'}`)
                console.log(`   화력: ${issue.heat_index}점`)
                console.log(`   생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}\n`)
            })
        } else {
            console.log('없음\n')
        }
    }

    // approval_type이 null인 승인 이슈 전체 확인
    const { data: nullApprovals, count } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index', { count: 'exact' })
        .eq('approval_status', '승인')
        .is('approval_type', null)
        .order('created_at', { ascending: false })
        .limit(10)

    console.log(`[ 승인 + approval_type null 이슈 ]\n`)
    console.log(`총 ${count}개\n`)
    if (nullApprovals && nullApprovals.length > 0) {
        nullApprovals.forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점\n`)
        })
    }
}

main().catch(console.error)
