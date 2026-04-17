/**
 * scripts/check-neukgu-ai-judgment.ts
 * 
 * 늑구 이슈가 연예로 분류된 AI 판단 과정 재현
 */

import { createClient } from '@supabase/supabase-js'

const PRODUCTION_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PRODUCTION_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

async function main() {
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY)
    
    const issueId = '830c40ae-9327-4c78-a701-40a4258c7520'
    
    console.log('🔍 늑구 이슈 AI 판단 과정 분석\n')
    
    console.log('📋 이슈 정보:')
    console.log('  제목: 늑구 탈출 후 생포')
    console.log('  카테고리: 연예 (←문제!)')
    console.log('  생성일: 2026-04-16 19:00')
    console.log()
    
    const { data: newsData } = await supabase
        .from('news_data')
        .select('title, category, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: false })
    
    if (!newsData) {
        console.log('❌ 뉴스 데이터를 찾을 수 없습니다.')
        return
    }
    
    console.log(`📰 연결된 뉴스 (총 ${newsData.length}개):\n`)
    
    const categoryCount: Record<string, number> = {}
    const entertainmentNews: string[] = []
    
    newsData.forEach((news, idx) => {
        categoryCount[news.category] = (categoryCount[news.category] || 0) + 1
        
        if (news.category === '연예') {
            entertainmentNews.push(news.title)
        }
        
        console.log(`[${idx + 1}] ${news.category} | ${news.title}`)
    })
    
    console.log('\n' + '─'.repeat(80))
    console.log('\n📊 카테고리 분포:')
    Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            const percent = ((count / newsData.length) * 100).toFixed(1)
            console.log(`  ${cat}: ${count}개 (${percent}%)`)
        })
    
    console.log('\n' + '─'.repeat(80))
    console.log('\n🔍 원인 분석:')
    console.log()
    
    if (entertainmentNews.length > 0) {
        console.log(`❌ ${entertainmentNews.length}개의 뉴스가 "연예" 카테고리로 저장되었습니다.`)
        console.log()
        console.log('연예로 분류된 뉴스들:')
        entertainmentNews.forEach((title, idx) => {
            console.log(`  ${idx + 1}. ${title}`)
        })
        console.log()
        console.log('💡 분석:')
        console.log('  1. AI가 "늑구" 키워드를 분석할 때 "연예" 카테고리로 잘못 판단')
        console.log('  2. searchNaverNewsByKeyword() 함수가 이 카테고리를 뉴스에 저장')
        console.log('  3. 이슈 생성 시 AI가 판단한 카테고리를 그대로 사용')
        console.log()
        console.log('🎯 근본 원인:')
        console.log('  AI가 커뮤니티 키워드 "늑구"를 분석할 때:')
        console.log('  - "국민 늑대", "스타 늑대" 같은 표현 때문에 "연예인"으로 오인')
        console.log('  - 또는 "생포" 같은 자극적 표현을 연예 스캔들로 오판')
        console.log()
    } else {
        console.log('✅ 뉴스 카테고리는 정상이지만, 이슈 카테고리가 잘못 설정되었습니다.')
        console.log('   → AI 판단 오류 또는 다른 로직 문제일 가능성')
    }
    
    console.log('─'.repeat(80))
    console.log()
    console.log('🛠️  해결 방안:')
    console.log()
    console.log('1. AI 프롬프트 개선:')
    console.log('   - 동물 관련 사건은 무조건 "사회" 카테고리로 분류하도록 명시')
    console.log('   - "국민 OO", "스타 OO"는 유명세를 의미하는 비유적 표현임을 학습')
    console.log()
    console.log('2. 검증 로직 추가:')
    console.log('   - 뉴스 제목에 "동물원", "탈출", "포획" 같은 키워드가 있으면')
    console.log('   - AI가 "연예"로 판단하더라도 "사회"로 강제 보정')
    console.log()
    console.log('3. 키워드 블랙리스트:')
    console.log('   - "늑대", "호랑이", "곰" 등 동물 키워드는 연예 카테고리 제외')
    console.log()
}

main().catch(console.error)
