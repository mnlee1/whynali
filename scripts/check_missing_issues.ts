import { supabaseAdmin } from '../lib/supabase/server'

async function run() {
    console.log('🔍 정국 및 임주환 이슈 추적 중...')

    // 1. 임주환 관련 기사 확인
    console.log('\n[1] 임주환 관련 뉴스 데이터:')
    const { data: hwanNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, issue_id, created_at')
        .ilike('title', '%임주환%')
    
    console.log(hwanNews)

    if (hwanNews && hwanNews.length > 0) {
        const issueIds = [...new Set(hwanNews.map(n => n.issue_id).filter(id => id))]
        if (issueIds.length > 0) {
            console.log(`\n[1-1] 임주환 기사가 연결된 이슈 ID들:`, issueIds)
            const { data: hwanIssues } = await supabaseAdmin
                .from('issues')
                .select('id, title, approval_status, heat_index')
                .in('id', issueIds)
            console.log(hwanIssues)
        } else {
            console.log('임주환 관련 기사는 있으나, 이슈로 묶이지 않음 (issue_id가 null)')
        }
    }

    // 2. 정국 관련 기사 확인
    console.log('\n[2] 정국 관련 뉴스 데이터:')
    const { data: jkNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, issue_id, created_at')
        .ilike('title', '%정국%')
    
    console.log(jkNews)

    if (jkNews && jkNews.length > 0) {
        const jkIssueIds = [...new Set(jkNews.map(n => n.issue_id).filter(id => id))]
        if (jkIssueIds.length > 0) {
            console.log(`\n[2-1] 정국 기사가 연결된 이슈 ID들:`, jkIssueIds)
            const { data: jkIssues } = await supabaseAdmin
                .from('issues')
                .select('id, title, approval_status, heat_index')
                .in('id', jkIssueIds)
            console.log(jkIssues)
        } else {
             console.log('정국 관련 기사는 있으나, 이슈로 묶이지 않음 (issue_id가 null)')
        }
    }
}

run().catch(console.error)