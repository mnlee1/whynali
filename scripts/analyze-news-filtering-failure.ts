/**
 * scripts/analyze-news-filtering-failure.ts
 * 
 * "전시 살해 논란" 이슈의 AI 필터링 실패 원인 분석
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function analyzeFilteringFailure() {
    console.log('=== AI 필터링 실패 원인 분석 ===\n')
    
    const issueId = '82acb5c8-b0fc-4396-aa3a-3273db8b366b'
    
    // 1. 이슈 정보
    const { data: issue } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    if (!issue) {
        console.log('이슈를 찾을 수 없습니다.')
        return
    }
    
    console.log('이슈 정보:')
    console.log(`  제목: ${issue.title}`)
    console.log(`  검색 키워드: ${issue.search_keyword || 'N/A'}`)
    console.log(`  생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
    console.log()
    
    // 2. 연결된 뉴스 분석
    const { data: news } = await supabase
        .from('news_data')
        .select('*')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: true })
    
    if (!news || news.length === 0) {
        console.log('연결된 뉴스가 없습니다.')
        return
    }
    
    console.log(`연결된 뉴스 ${news.length}개:\n`)
    
    // 이슈 관련성 분석
    const relevant = []
    const irrelevant = []
    
    for (const item of news) {
        const title = item.title.toLowerCase()
        const hasWartime = title.includes('이스라엘') || title.includes('하마스') || 
                          title.includes('이재명') || title.includes('대통령')
        const hasExhibition = title.includes('미술') || title.includes('작품') || 
                             title.includes('회고전') || title.includes('작가') ||
                             title.includes('도청') || title.includes('개최')
        
        const analysis = {
            id: item.id,
            title: item.title,
            source: item.source,
            published_at: new Date(item.published_at).toLocaleString('ko-KR'),
            search_keyword: item.search_keyword,
            hasWartime,
            hasExhibition,
            relevant: hasWartime && !hasExhibition
        }
        
        if (analysis.relevant) {
            relevant.push(analysis)
        } else {
            irrelevant.push(analysis)
        }
    }
    
    console.log('━'.repeat(80))
    console.log(`\n✅ 올바르게 연결된 뉴스: ${relevant.length}개\n`)
    relevant.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.title}`)
        console.log(`   출처: ${item.source} | ${item.published_at}`)
        if (item.search_keyword) {
            console.log(`   검색 키워드: ${item.search_keyword}`)
        }
        console.log()
    })
    
    console.log('━'.repeat(80))
    console.log(`\n❌ 잘못 연결된 뉴스: ${irrelevant.length}개\n`)
    irrelevant.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.title}`)
        console.log(`   출처: ${item.source} | ${item.published_at}`)
        if (item.search_keyword) {
            console.log(`   검색 키워드: ${item.search_keyword}`)
        }
        console.log(`   이유: ${item.hasExhibition ? '전시(展示) 관련' : '기타'}`)
        console.log()
    })
    
    // 3. search_keyword 분석
    const keywordGroups = new Map<string, number>()
    news.forEach(item => {
        if (item.search_keyword) {
            keywordGroups.set(item.search_keyword, (keywordGroups.get(item.search_keyword) || 0) + 1)
        }
    })
    
    console.log('━'.repeat(80))
    console.log('\n검색 키워드 분포:\n')
    Array.from(keywordGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([keyword, count]) => {
            console.log(`  "${keyword}": ${count}개`)
        })
    
    console.log('\n━'.repeat(80))
    console.log('\n💡 분석 결과:\n')
    
    if (irrelevant.length > 0) {
        console.log(`1. AI 필터링 실패: ${irrelevant.length}/${news.length}개 뉴스가 잘못 연결됨`)
        console.log(`2. 실패율: ${((irrelevant.length / news.length) * 100).toFixed(1)}%`)
        
        const exhibitionCount = irrelevant.filter(i => i.hasExhibition).length
        if (exhibitionCount > 0) {
            console.log(`3. 주요 원인: "전시(戰時)" vs "전시(展示)" 동음이의어 혼동 (${exhibitionCount}건)`)
        }
        
        // 검색 키워드가 문제인지 확인
        const hasCommonKeyword = irrelevant.some(i => 
            relevant.some(r => r.search_keyword === i.search_keyword)
        )
        
        if (hasCommonKeyword) {
            console.log('4. 같은 검색 키워드에서 관련/무관 뉴스가 섞여 있음 → AI 필터링 필요')
        } else {
            console.log('4. 검색 키워드 자체가 잘못됨 → 키워드 선택 개선 필요')
        }
    } else {
        console.log('✅ 모든 뉴스가 올바르게 연결됨')
    }
}

analyzeFilteringFailure().catch(console.error)
