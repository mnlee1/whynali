import { supabaseAdmin } from '../lib/supabase/server'

async function checkNewIssues() {
    // 5분 이내 생성된 이슈
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: newIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, created_at, heat_index')
        .gte('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
    
    console.log(`\n방금 생성된 이슈 (5분 이내): ${newIssues?.length || 0}건`)
    newIssues?.forEach((issue, i) => {
        console.log(`  ${i+1}. [${issue.approval_status}] ${issue.title}`)
        console.log(`     카테고리: ${issue.category} | 화력: ${issue.heat_index || 0}점`)
    })
    
    // 정국 관련 이슈 검색
    const { data: jungkookIssues } = await supabaseAdmin
        .from('issues')
        .select('*')
        .ilike('title', '%정국%')
        .order('created_at', { ascending: false })
        .limit(5)
    
    console.log(`\n정국 관련 이슈: ${jungkookIssues?.length || 0}건`)
    jungkookIssues?.forEach((issue, i) => {
        console.log(`  ${i+1}. [${issue.approval_status}] ${issue.title}`)
        console.log(`     생성: ${issue.created_at}`)
    })
}

checkNewIssues()
