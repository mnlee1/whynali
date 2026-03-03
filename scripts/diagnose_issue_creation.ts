// 이슈 생성 실패 원인 진단

import { supabaseAdmin } from '../lib/supabase/server'

async function diagnoseIssueCreation() {
    console.log('=== 이슈 생성 실패 원인 진단 ===\n')
    
    // 1. 최근 수집된 뉴스 확인 (행크스, 윤종신)
    console.log('[1단계] 최근 수집된 뉴스 확인')
    const { data: recentNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, created_at, issue_id, category')
        .or('title.ilike.%행크스%,title.ilike.%윤종신%')
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log(`뉴스 수집 건수: ${recentNews?.length || 0}건`)
    if (recentNews && recentNews.length > 0) {
        recentNews.forEach((news, i) => {
            console.log(`  ${i+1}. ${news.title.slice(0, 50)}`)
            console.log(`     수집: ${news.created_at}`)
            console.log(`     카테고리: ${news.category}`)
            console.log(`     연결 이슈: ${news.issue_id || '없음'}`)
        })
    } else {
        console.log('  ❌ 뉴스 수집 안 됨 (테스트만 했고 실제 수집은 안 됨)')
    }
    
    // 2. 이슈 후보 생성 조건 확인
    console.log('\n[2단계] 이슈 후보 생성 조건 확인')
    console.log('조건:')
    console.log('  - 최소 5건 이상 뉴스 (ALERT_THRESHOLD)')
    console.log('  - 최소 2개 언론사 (MIN_UNIQUE_SOURCES)')
    console.log('  - 공통 키워드 2개 이상')
    console.log('  - 최근 24시간 내 수집')
    
    // 3. 실제 이슈 생성 여부 확인
    console.log('\n[3단계] 최근 생성된 이슈 확인')
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, created_at')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log(`최근 24시간 이슈: ${recentIssues?.length || 0}건`)
    if (recentIssues && recentIssues.length > 0) {
        recentIssues.forEach((issue, i) => {
            console.log(`  ${i+1}. [${issue.approval_status}] ${issue.title}`)
            console.log(`     카테고리: ${issue.category}`)
            console.log(`     생성: ${issue.created_at}`)
        })
    }
    
    // 4. 문제 진단
    console.log('\n[4단계] 문제 진단')
    
    if (!recentNews || recentNews.length === 0) {
        console.log('❌ 원인 1: 뉴스가 실제로 수집되지 않음')
        console.log('   → 해결: Cron 실행 대기 또는 수동 실행 필요')
        console.log('   → curl http://localhost:3000/api/cron/collect-news')
    } else if (recentNews.length < 5) {
        console.log('❌ 원인 2: 뉴스 건수 부족 (5건 미만)')
        console.log(`   → 현재: ${recentNews.length}건`)
        console.log('   → 해결: ALERT_THRESHOLD 낮추기 또는 더 많은 뉴스 수집')
    } else {
        console.log('✅ 뉴스는 충분히 수집됨')
        console.log('❌ 원인 3: 키워드 그루핑 실패 (공통 키워드 부족)')
        console.log('   → 해결: 키워드 분석 로직 확인 필요')
    }
    
    // 5. 실시간 환경변수 확인
    console.log('\n[5단계] 환경변수 확인')
    console.log(`ALERT_THRESHOLD: ${process.env.CANDIDATE_ALERT_THRESHOLD || '5 (기본값)'}`)
    console.log(`MIN_UNIQUE_SOURCES: ${process.env.CANDIDATE_MIN_UNIQUE_SOURCES || '2 (기본값)'}`)
    console.log(`MIN_HEAT_TO_REGISTER: ${process.env.CANDIDATE_MIN_HEAT_TO_REGISTER || '10 (기본값)'}`)
}

diagnoseIssueCreation().catch(console.error)
