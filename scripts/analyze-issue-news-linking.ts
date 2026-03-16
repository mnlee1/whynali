/**
 * scripts/analyze-issue-news-linking.ts
 * 
 * 특정 이슈의 뉴스 연결 상태 분석
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'
import { tokenize } from '../lib/candidate/tokenizer'

async function analyzeIssueNewsLinking() {
    console.log('=== 이슈 뉴스 연결 분석 ===\n')

    const issueTitle = "3만석 돔구장 코엑스 2.5배 전시 잠실 스포츠 MICE 파크 사업 본격"

    // 1. 이슈 찾기
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('*')
        .ilike('title', `%잠실%스포츠%`)
        .order('created_at', { ascending: false })
        .limit(5)

    console.log('📋 검색된 이슈:\n')
    
    if (!issues || issues.length === 0) {
        console.log('❌ 이슈를 찾을 수 없습니다.\n')
        return
    }

    const targetIssue = issues.find(i => i.title.includes('잠실')) || issues[0]
    
    console.log(`대상 이슈:`)
    console.log(`  제목: ${targetIssue.title}`)
    console.log(`  ID: ${targetIssue.id}`)
    console.log(`  카테고리: ${targetIssue.category}`)
    console.log(`  화력: ${targetIssue.created_heat_index}`)
    console.log(`  생성: ${new Date(targetIssue.created_at).toLocaleString()}\n`)

    // 이슈 키워드 추출
    const issueKeywords = JSON.parse(targetIssue.keywords || '[]')
    console.log(`이슈 키워드: [${issueKeywords.join(', ')}]\n`)

    const issueTokens = tokenize(targetIssue.title)
    console.log(`이슈 토큰: [${issueTokens.join(', ')}]\n`)

    console.log('━'.repeat(80) + '\n')

    // 2. 연결된 뉴스 확인
    const { data: linkedNews, count: linkedCount } = await supabaseAdmin
        .from('news_data')
        .select('id, title, source, published_at', { count: 'exact' })
        .eq('issue_id', targetIssue.id)
        .order('published_at', { ascending: true })
        .limit(10)

    console.log(`✅ 연결된 뉴스: ${linkedCount}건\n`)
    
    if (linkedNews && linkedNews.length > 0) {
        linkedNews.forEach((news, idx) => {
            console.log(`${idx + 1}. ${news.title}`)
            console.log(`   출처: ${news.source} | ${new Date(news.published_at).toLocaleString()}`)
            
            const newsTokens = tokenize(news.title)
            const commonTokens = issueTokens.filter(t => newsTokens.includes(t))
            console.log(`   공통 토큰 (${commonTokens.length}): [${commonTokens.join(', ')}]\n`)
        })
    }

    console.log('━'.repeat(80) + '\n')

    // 3. 관련될 것 같은 미연결 뉴스 검색
    console.log('🔍 잠실/돔구장/MICE 관련 미연결 뉴스 검색:\n')

    const { data: unlinkedNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, source, published_at, issue_id')
        .is('issue_id', null)
        .or('title.ilike.%잠실%,title.ilike.%돔구장%,title.ilike.%MICE%')
        .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(20)

    if (unlinkedNews && unlinkedNews.length > 0) {
        console.log(`미연결 뉴스 ${unlinkedNews.length}건 발견:\n`)
        
        unlinkedNews.forEach((news, idx) => {
            console.log(`${idx + 1}. ${news.title}`)
            console.log(`   출처: ${news.source} | ${new Date(news.published_at).toLocaleString()}`)
            
            const newsTokens = tokenize(news.title)
            const commonTokens = issueTokens.filter(t => newsTokens.includes(t))
            console.log(`   공통 토큰 (${commonTokens.length}): [${commonTokens.join(', ')}]`)
            
            if (commonTokens.length >= 2) {
                console.log(`   ⚠️  연결 가능성 높음 (공통 토큰 ${commonTokens.length}개)`)
            }
            console.log()
        })
    } else {
        console.log('미연결 관련 뉴스 없음\n')
    }

    console.log('━'.repeat(80) + '\n')

    // 4. 다른 이슈에 연결된 관련 뉴스
    console.log('🔍 다른 이슈에 연결된 관련 뉴스 검색:\n')

    const { data: otherLinkedNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, source, published_at, issue_id, issues(id, title)')
        .not('issue_id', 'is', null)
        .neq('issue_id', targetIssue.id)
        .or('title.ilike.%잠실%,title.ilike.%돔구장%,title.ilike.%MICE%')
        .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(10)

    if (otherLinkedNews && otherLinkedNews.length > 0) {
        console.log(`다른 이슈에 연결된 뉴스 ${otherLinkedNews.length}건:\n`)
        
        otherLinkedNews.forEach((news, idx) => {
            console.log(`${idx + 1}. ${news.title}`)
            console.log(`   출처: ${news.source} | ${new Date(news.published_at).toLocaleString()}`)
            console.log(`   연결 이슈: ${news.issues?.title || 'N/A'}`)
            
            const newsTokens = tokenize(news.title)
            const commonTokens = issueTokens.filter(t => newsTokens.includes(t))
            console.log(`   공통 토큰 (${commonTokens.length}): [${commonTokens.join(', ')}]`)
            
            if (commonTokens.length >= 2) {
                console.log(`   ⚠️  오연결 가능성 (공통 토큰 ${commonTokens.length}개)`)
            }
            console.log()
        })
    } else {
        console.log('다른 이슈에 연결된 관련 뉴스 없음\n')
    }

    console.log('━'.repeat(80) + '\n')

    // 5. 연결 설정 확인
    console.log('⚙️  뉴스 연결 설정:\n')
    console.log(`LINK_MIN_COMMON_TOKENS: ${process.env.LINK_MIN_COMMON_TOKENS ?? '2'} (최소 공통 토큰)`)
    console.log(`NEWS_LINKING_DAYS: ${process.env.NEWS_LINKING_DAYS ?? '7'} (연결 기간)\n`)

    // 6. 분석 결과
    console.log('━'.repeat(80) + '\n')
    console.log('💡 분석 결과:\n')
    
    if (linkedCount === 0) {
        console.log('❌ 연결된 뉴스가 없습니다.\n')
        console.log('원인:')
        console.log('  1. 이슈 키워드와 일치하는 뉴스가 없음')
        console.log('  2. 뉴스 수집 시기가 이슈 생성 이후')
        console.log('  3. 토큰 매칭 임계값 미달')
    } else if (unlinkedNews && unlinkedNews.length > 0) {
        const shouldBeLinked = unlinkedNews.filter(n => {
            const newsTokens = tokenize(n.title)
            const common = issueTokens.filter(t => newsTokens.includes(t))
            return common.length >= 2
        })
        
        if (shouldBeLinked.length > 0) {
            console.log(`⚠️  연결되어야 할 뉴스 ${shouldBeLinked.length}건 발견\n`)
            console.log('원인:')
            console.log('  1. 이슈 생성 후 수집된 뉴스')
            console.log('  2. 자동 연결 cron이 아직 실행 안 됨')
            console.log('  3. 키워드 매칭 로직 문제\n')
            console.log('해결:')
            console.log('  - 수동으로 뉴스 재연결 실행')
            console.log('  - cron 실행 대기 (30분마다)')
        } else {
            console.log('✅ 미연결 뉴스는 관련성이 낮음 (정상)')
        }
    } else {
        console.log('✅ 모든 관련 뉴스가 정상 연결됨')
    }
}

analyzeIssueNewsLinking().catch(console.error)
