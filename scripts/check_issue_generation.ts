import { supabaseAdmin } from '../lib/supabase/server'

async function run() {
    console.log('📊 이슈 생성 현황 점검')
    
    // 1. 최근 3일간 생성된 이슈 통계
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, heat_index, created_at')
        .gte('created_at', threeDaysAgo)
        .order('created_at', { ascending: false })
    
    console.log(`\n최근 3일간 생성된 이슈: ${recentIssues?.length || 0}건`)
    
    if (recentIssues && recentIssues.length > 0) {
        const byDate = new Map<string, number>()
        const byStatus = new Map<string, number>()
        
        recentIssues.forEach(issue => {
            const date = issue.created_at.split('T')[0]
            byDate.set(date, (byDate.get(date) || 0) + 1)
            byStatus.set(issue.approval_status, (byStatus.get(issue.approval_status) || 0) + 1)
        })
        
        console.log('\n날짜별 이슈 생성:')
        Array.from(byDate.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, count]) => {
                console.log(`  ${date}: ${count}건`)
            })
        
        console.log('\n상태별 이슈 분포:')
        Array.from(byStatus.entries()).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}건`)
        })
        
        console.log('\n화력 분포:')
        const heatRanges = {
            '70 이상': recentIssues.filter(i => i.heat_index >= 70).length,
            '30-69': recentIssues.filter(i => i.heat_index >= 30 && i.heat_index < 70).length,
            '15-29': recentIssues.filter(i => i.heat_index >= 15 && i.heat_index < 30).length,
            '15 미만': recentIssues.filter(i => i.heat_index < 15).length,
        }
        Object.entries(heatRanges).forEach(([range, count]) => {
            console.log(`  ${range}: ${count}건`)
        })
    }
    
    // 2. 최근 24시간 미연결 뉴스/커뮤니티 데이터
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const { count: unlinkedNewsCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
        .is('issue_id', null)
    
    const { count: unlinkedCommunityCount } = await supabaseAdmin
        .from('community_data')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
        .is('issue_id', null)
    
    console.log(`\n최근 24시간 미연결 데이터:`)
    console.log(`  뉴스: ${unlinkedNewsCount || 0}건`)
    console.log(`  커뮤니티: ${unlinkedCommunityCount || 0}건`)
    
    // 3. Cron 작업 실행 여부 확인 (최근 뉴스 수집 시간)
    const { data: latestNews } = await supabaseAdmin
        .from('news_data')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
    
    const { data: latestCommunity } = await supabaseAdmin
        .from('community_data')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
    
    console.log(`\n최근 데이터 수집 시각:`)
    console.log(`  뉴스: ${latestNews?.[0]?.created_at || 'N/A'}`)
    console.log(`  커뮤니티: ${latestCommunity?.[0]?.created_at || 'N/A'}`)
}

run().catch(console.error)