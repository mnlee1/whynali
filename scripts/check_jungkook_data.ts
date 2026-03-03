import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    // 1. 정국 관련 뉴스 검색
    const { data: newsData } = await supabaseAdmin
        .from('news_data')
        .select('id, title, created_at, issue_id, category')
        .or('title.ilike.%정국%,title.ilike.%방탄%,title.ilike.%BTS%')
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log('=== 정국/방탄/BTS 관련 뉴스 (최근 10건) ===')
    if (!newsData || newsData.length === 0) {
        console.log('❌ 관련 뉴스 없음')
    } else {
        newsData.forEach(news => {
            console.log(`\n제목: ${news.title}`)
            console.log(`수집일: ${news.created_at}`)
            console.log(`카테고리: ${news.category || 'null'}`)
            console.log(`연결 이슈: ${news.issue_id || 'null'}`)
        })
    }
    
    // 2. 정국 라방 커뮤니티 글 검색
    const { data: communityData } = await supabaseAdmin
        .from('community_data')
        .select('id, title, written_at, created_at, issue_id, view_count, comment_count')
        .ilike('title', '%정국%')
        .order('created_at', { ascending: false })
        .limit(5)
    
    console.log('\n\n=== 정국 관련 커뮤니티 글 ===')
    if (!communityData || communityData.length === 0) {
        console.log('❌ 관련 커뮤니티 글 없음')
    } else {
        communityData.forEach(post => {
            console.log(`\n제목: ${post.title}`)
            console.log(`작성일: ${post.written_at}`)
            console.log(`수집일: ${post.created_at}`)
            console.log(`조회수: ${post.view_count} / 댓글: ${post.comment_count}`)
            console.log(`연결 이슈: ${post.issue_id || 'null'}`)
        })
    }
    
    // 3. 최근 24시간 연예 카테고리 이슈 목록
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: issuesData } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, created_at')
        .eq('category', '연예')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
    
    console.log('\n\n=== 최근 24시간 연예 이슈 목록 ===')
    if (!issuesData || issuesData.length === 0) {
        console.log('❌ 최근 24시간 내 연예 이슈 없음')
    } else {
        issuesData.forEach(issue => {
            console.log(`\n[${issue.approval_status}] ${issue.title}`)
            console.log(`생성일: ${issue.created_at}`)
        })
    }
}

main().catch(console.error)
