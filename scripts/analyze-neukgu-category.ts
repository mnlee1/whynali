/**
 * scripts/analyze-neukgu-category.ts
 * 
 * '늑구 탈출 후 생포' 이슈가 연예로 분류된 상세 원인 분석
 */

import { createClient } from '@supabase/supabase-js'
import { CATEGORIES, getCategoryKeywords } from '../lib/config/categories'

const PRODUCTION_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PRODUCTION_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

async function main() {
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY)
    
    const issueId = '830c40ae-9327-4c78-a701-40a4258c7520'
    
    console.log('🔍 "늑구 탈출 후 생포" 이슈 상세 분석\n')
    
    const { data: issue } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    if (!issue) {
        console.log('❌ 이슈를 찾을 수 없습니다.')
        return
    }
    
    console.log('📋 이슈 정보')
    console.log(`  제목: ${issue.title}`)
    console.log(`  카테고리: ${issue.category}`)
    console.log(`  화력: ${issue.heat_score}`)
    console.log(`  생성일: ${issue.created_at}`)
    console.log()
    
    const { data: newsData } = await supabase
        .from('news_data')
        .select('title, content, news_url')
        .eq('issue_id', issueId)
    
    const entertainmentKeywords = getCategoryKeywords('연예')
    
    if (newsData && newsData.length > 0) {
        console.log('📰 관련 뉴스 제목 분석\n')
        
        console.log(`🔑 연예 카테고리 키워드 (${entertainmentKeywords.length}개):`)
        console.log(entertainmentKeywords.join(', '))
        console.log()
        
        console.log('─'.repeat(80))
        
        newsData.forEach((news, idx) => {
            console.log(`\n[뉴스 ${idx + 1}] ${news.title}`)
            
            const foundKeywords: string[] = []
            entertainmentKeywords.forEach(keyword => {
                if (news.title.includes(keyword)) {
                    foundKeywords.push(keyword)
                }
            })
            
            if (foundKeywords.length > 0) {
                console.log(`  ⚠️  매칭된 연예 키워드: ${foundKeywords.join(', ')}`)
            } else {
                console.log(`  ✅ 매칭된 연예 키워드 없음`)
            }
        })
        
        console.log('\n' + '─'.repeat(80))
    }
    
    const { data: candidateLog } = await supabase
        .from('candidate_log')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: false })
        .limit(1)
    
    if (candidateLog && candidateLog.length > 0) {
        const log = candidateLog[0]
        console.log('\n📝 후보 생성 로그:')
        console.log(`  키워드: ${log.keyword}`)
        console.log(`  카테고리: ${log.category}`)
        console.log(`  신뢰도: ${log.confidence}`)
        console.log(`  생성 시각: ${log.created_at}`)
        
        if (log.ai_verification) {
            console.log('\n🤖 AI 검증 결과:')
            console.log(JSON.stringify(log.ai_verification, null, 2))
        }
        
        if (log.category_decision) {
            console.log('\n🎯 카테고리 결정 과정:')
            console.log(JSON.stringify(log.category_decision, null, 2))
        }
    }
    
    console.log('\n\n📊 카테고리별 키워드 매칭 분석:')
    console.log('═'.repeat(80))
    
    const allTitles = newsData?.map(n => n.title).join(' ') || ''
    
    CATEGORIES.forEach(cat => {
        const keywords = cat.keywords
        const matchedKeywords = keywords.filter(keyword => allTitles.includes(keyword))
        
        if (matchedKeywords.length > 0) {
            console.log(`\n[${cat.label}] ${matchedKeywords.length}개 키워드 매칭:`)
            console.log(`  ${matchedKeywords.join(', ')}`)
        }
    })
    
    console.log('\n\n🔍 결론:')
    console.log('─'.repeat(80))
    
    const entertainmentMatches = entertainmentKeywords.filter(keyword => allTitles.includes(keyword))
    if (entertainmentMatches.length > 0) {
        console.log(`❌ 연예 키워드가 ${entertainmentMatches.length}개 매칭되어 잘못 분류되었습니다.`)
        console.log(`   매칭된 키워드: ${entertainmentMatches.join(', ')}`)
        console.log(`   이 키워드들이 뉴스 제목에 포함되어 연예 카테고리로 오분류되었을 가능성이 높습니다.`)
    } else {
        console.log('✅ 연예 키워드가 매칭되지 않았습니다. AI 분류 오류일 가능성이 있습니다.')
    }
}

main().catch(console.error)
