/**
 * scripts/check_specific_issue.ts
 * 
 * 특정 이슈 상태 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    const title = '언팩 D-1…갤럭시 S26 출격준비 \'이상무\''
    
    console.log('=== 이슈 상태 확인 ===\n')
    console.log(`검색어: ${title}\n`)
    
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('*')
        .ilike('title', `%갤럭시 S26%`)
    
    if (!issues || issues.length === 0) {
        console.log('❌ 이슈를 찾을 수 없습니다.')
        return
    }
    
    console.log(`📋 찾은 이슈: ${issues.length}개\n`)
    
    for (const issue of issues) {
        console.log(`제목: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`상태(status): ${issue.status}`)
        console.log(`승인상태(approval_status): ${issue.approval_status}`)
        console.log(`승인타입(approval_type): ${issue.approval_type}`)
        console.log(`화력: ${issue.heat_index}`)
        console.log(`생성일: ${issue.created_at}`)
        console.log(`승인일: ${issue.approved_at}`)
        console.log(`업데이트: ${issue.updated_at}`)
        console.log()
    }
}

main().catch(console.error)
