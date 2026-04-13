/**
 * scripts/check-production-issues.ts
 * 
 * 실서버 이슈 확인 스크립트
 */

import { createClient } from '@supabase/supabase-js'

// 실서버 연결
const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function checkProductionIssues() {
    console.log('실서버 이슈 확인...\n')
    
    // "전시" 또는 "살해" 키워드 포함 이슈 검색
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, status, created_at, created_heat_index')
        .or('title.ilike.%전시%,title.ilike.%살해%')
        .order('created_at', { ascending: false })
        .limit(50)
    
    if (error) {
        console.error('에러:', error)
        return
    }
    
    console.log(`총 ${issues?.length || 0}개 이슈 발견:\n`)
    
    issues?.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title}`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   카테고리: ${issue.category} | 상태: ${issue.status} | 화력: ${issue.created_heat_index}`)
        console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        
        // "전시"와 "살해"가 모두 포함된 경우 강조
        if (issue.title.includes('전시') && issue.title.includes('살해')) {
            console.log('   🔴 전시 + 살해 키워드 모두 포함!')
        }
        console.log()
    })
    
    // 특히 "전시 살해" 또는 "살해 논란" 포함 이슈
    const relevantIssues = issues?.filter(i => 
        (i.title.includes('전시') && i.title.includes('살해')) ||
        i.title.includes('살해 논란')
    )
    
    if (relevantIssues && relevantIssues.length > 0) {
        console.log('━'.repeat(80))
        console.log('\n특별히 주목할 이슈:\n')
        
        for (const issue of relevantIssues) {
            console.log(`제목: ${issue.title}`)
            console.log(`ID: ${issue.id}`)
            
            // 연결된 뉴스 확인
            const { data: news, count } = await supabase
                .from('news_data')
                .select('id, title, source, published_at', { count: 'exact' })
                .eq('issue_id', issue.id)
                .order('published_at', { ascending: false })
                .limit(10)
            
            console.log(`연결된 뉴스: ${count || 0}개`)
            
            if (news && news.length > 0) {
                console.log('\n뉴스 목록:')
                news.forEach((n, idx) => {
                    console.log(`  ${idx + 1}. ${n.title}`)
                    console.log(`     출처: ${n.source} | ${new Date(n.published_at).toLocaleString('ko-KR')}`)
                })
            } else {
                console.log('⚠️  연결된 뉴스가 없습니다!')
            }
            console.log()
        }
    }
}

checkProductionIssues().catch(console.error)
