/**
 * scripts/check-neukgu-issue.ts
 * 
 * 실서버에서 '늑구 탈출 후 생포' 이슈의 카테고리 매칭 원인 파악
 */

import { createClient } from '@supabase/supabase-js'

const PRODUCTION_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PRODUCTION_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

async function main() {
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY)
    
    console.log('🔍 실서버에서 "늑구" 관련 이슈 검색 중...\n')
    
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%늑구%')
        .order('created_at', { ascending: false })
    
    if (error) {
        console.error('❌ 에러:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('❌ "늑구" 관련 이슈를 찾을 수 없습니다.')
        return
    }
    
    console.log(`✅ 총 ${issues.length}개의 "늑구" 관련 이슈 발견\n`)
    
    for (const issue of issues) {
        console.log('─'.repeat(80))
        console.log(`📋 이슈 ID: ${issue.id}`)
        console.log(`📌 제목: ${issue.title}`)
        console.log(`🏷️  카테고리: ${issue.category}`)
        console.log(`🔥 화력: ${issue.heat_score}점`)
        console.log(`⏰ 생성일: ${issue.created_at}`)
        console.log(`📊 상태: ${issue.status}`)
        
        if (issue.category === '연예') {
            console.log('\n⚠️  [연예 카테고리로 분류됨 - 원인 분석 필요]\n')
            
            const { data: newsData } = await supabase
                .from('news_data')
                .select('*')
                .eq('issue_id', issue.id)
                .limit(10)
            
            if (newsData && newsData.length > 0) {
                console.log(`📰 관련 뉴스 데이터 (${newsData.length}건):`)
                newsData.forEach((news, idx) => {
                    console.log(`\n[뉴스 ${idx + 1}]`)
                    console.log(`  제목: ${news.title}`)
                    console.log(`  URL: ${news.news_url}`)
                    console.log(`  본문 미리보기: ${news.content?.substring(0, 200)}...`)
                })
            }
            
            const { data: candidateLog } = await supabase
                .from('candidate_log')
                .select('*')
                .contains('titles', [issue.title])
                .order('created_at', { ascending: false })
                .limit(1)
            
            if (candidateLog && candidateLog.length > 0) {
                const log = candidateLog[0]
                console.log('\n📝 후보 생성 로그:')
                console.log(`  키워드: ${log.keyword}`)
                console.log(`  카테고리: ${log.category}`)
                console.log(`  AI 검증: ${log.ai_verification}`)
                console.log(`  제목들: ${JSON.stringify(log.titles)}`)
            }
        }
        
        console.log('\n')
    }
}

main().catch(console.error)
