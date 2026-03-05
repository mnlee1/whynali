/**
 * scripts/check_tarantino_issue.ts
 * 
 * 타란티노 이슈 카테고리 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 타란티노 이슈 확인 ===\n')
    
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('*')
        .ilike('title', '%타란티노%')
    
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
        console.log(`승인상태: ${issue.approval_status}`)
        console.log(`화력: ${issue.heat_index}`)
        console.log(`생성일: ${issue.created_at}`)
        console.log()
        
        // 연결된 뉴스 확인
        const { data: news } = await supabaseAdmin
            .from('issue_news')
            .select('news_id')
            .eq('issue_id', issue.id)
        
        if (news && news.length > 0) {
            console.log(`연결된 뉴스: ${news.length}건`)
            
            // 뉴스 카테고리 확인
            const { data: newsData } = await supabaseAdmin
                .from('news_data')
                .select('title, category, link')
                .in('id', news.map(n => n.news_id))
                .limit(5)
            
            if (newsData) {
                console.log('\n뉴스 샘플:')
                for (const n of newsData) {
                    console.log(`  - [${n.category}] ${n.title}`)
                    console.log(`    ${n.link}`)
                }
            }
        }
        console.log()
    }
}

main().catch(console.error)
