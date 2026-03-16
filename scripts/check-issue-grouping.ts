/**
 * scripts/check-issue-grouping.ts
 * 
 * 특정 이슈들이 왜 묶이지 않았는지 확인
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'
import { tokenize } from '../lib/candidate/tokenizer'

async function checkIssueGrouping() {
    console.log('=== 이슈 그루핑 분석 ===\n')

    const title1 = '유한재단, 사회보장정보원과 돌봄 청소년·청년 지원 업무협약 체결'
    const title2 = '유한재단, 한국사회보장정보원과 맞손…돌봄 청소년·청년 지원사업 추'

    // 1. 이슈 찾기
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, created_at, created_heat_index')
        .or(`title.ilike.%유한재단%,title.ilike.%사회보장정보원%`)
        .order('created_at', { ascending: false })
        .limit(10)

    console.log('📋 유한재단/사회보장정보원 관련 이슈:\n')
    
    if (issues && issues.length > 0) {
        issues.forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   ID: ${issue.id}`)
            console.log(`   카테고리: ${issue.category}`)
            console.log(`   화력: ${issue.created_heat_index}`)
            console.log(`   생성: ${new Date(issue.created_at).toLocaleString()}\n`)
        })
    } else {
        console.log('이슈를 찾을 수 없습니다.\n')
    }

    console.log('━'.repeat(80) + '\n')

    // 2. 토크나이징 비교
    console.log('🔍 토크나이징 분석:\n')
    
    const tokens1 = tokenize(title1)
    const tokens2 = tokenize(title2)

    console.log(`제목 1: "${title1}"`)
    console.log(`토큰: [${tokens1.join(', ')}]`)
    console.log(`토큰 수: ${tokens1.length}\n`)

    console.log(`제목 2: "${title2}"`)
    console.log(`토큰: [${tokens2.join(', ')}]`)
    console.log(`토큰 수: ${tokens2.length}\n`)

    // 3. 공통 키워드
    const commonTokens = tokens1.filter(t => tokens2.includes(t))
    console.log(`공통 토큰: [${commonTokens.join(', ')}]`)
    console.log(`공통 토큰 수: ${commonTokens.length}\n`)

    // 4. 그루핑 임계값 확인
    const GROUPING_MIN_COMMON = parseInt(process.env.GROUPING_MIN_COMMON ?? '2')
    
    console.log('━'.repeat(80) + '\n')
    console.log('⚙️  그루핑 설정:\n')
    console.log(`GROUPING_MIN_COMMON: ${GROUPING_MIN_COMMON} (최소 공통 키워드)`)
    console.log(`실제 공통 키워드: ${commonTokens.length}\n`)

    if (commonTokens.length >= GROUPING_MIN_COMMON) {
        console.log('✅ 그루핑 조건 충족 (공통 키워드 충분)')
    } else {
        console.log('❌ 그루핑 조건 미충족 (공통 키워드 부족)')
    }

    console.log('\n━'.repeat(80) + '\n')

    // 5. 각 이슈의 뉴스 확인
    if (issues && issues.length >= 2) {
        for (let i = 0; i < Math.min(2, issues.length); i++) {
            const issue = issues[i]
            
            const { data: news } = await supabaseAdmin
                .from('news_data')
                .select('title, published_at, source')
                .eq('issue_id', issue.id)
                .order('published_at', { ascending: true })
                .limit(5)

            console.log(`📰 이슈 "${issue.title.substring(0, 40)}..." 연결 뉴스:\n`)
            
            if (news && news.length > 0) {
                news.forEach((n, idx) => {
                    console.log(`   ${idx + 1}. ${n.title.substring(0, 60)}...`)
                    console.log(`      출처: ${n.source} | ${new Date(n.published_at).toLocaleString()}\n`)
                })
            } else {
                console.log('   연결된 뉴스 없음\n')
            }
        }
    }

    console.log('━'.repeat(80) + '\n')

    // 6. 원인 분석
    console.log('💡 묶이지 않은 원인 분석:\n')

    // 차이점 분석
    const diff1 = tokens1.filter(t => !tokens2.includes(t))
    const diff2 = tokens2.filter(t => !tokens1.includes(t))

    console.log(`제목 1 고유 토큰: [${diff1.join(', ')}]`)
    console.log(`제목 2 고유 토큰: [${diff2.join(', ')}]\n`)

    // 주요 차이점
    console.log('주요 차이점:')
    console.log('- "사회보장정보원" vs "한국사회보장정보원"')
    console.log('- "업무협약 체결" vs "맞손"')
    console.log('- "지원 업무협약" vs "지원사업"\n')

    // 토크나이저 문제 확인
    console.log('토크나이저 분석:')
    console.log('- "사회보장정보원"과 "한국사회보장정보원"이 다른 토큰으로 인식됨')
    console.log('- "한국"이 접두어인 경우 정규화되지 않음\n')

    console.log('해결 방안:')
    console.log('1. 토크나이저에 "한국XXX" → "XXX" 정규화 추가')
    console.log('2. 기관명 동의어 사전 추가 (한국사회보장정보원 = 사회보장정보원)')
    console.log('3. GROUPING_MIN_COMMON 값 조정')
}

checkIssueGrouping().catch(console.error)
