/**
 * scripts/debug-neukgu-data.ts
 * 
 * 늑구 이슈 데이터 직접 조회 및 디버깅
 */

import { createClient } from '@supabase/supabase-js'

const PRODUCTION_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PRODUCTION_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

async function main() {
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY)
    
    const issueId = '830c40ae-9327-4c78-a701-40a4258c7520'
    
    console.log('🔍 데이터베이스 직접 조회\n')
    
    const { data: issue, error: issueError } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    console.log('📋 이슈 전체 데이터:')
    console.log(JSON.stringify(issue, null, 2))
    console.log()
    
    const { data: newsData, error: newsError } = await supabase
        .from('news_data')
        .select('*')
        .eq('issue_id', issueId)
    
    console.log('📰 뉴스 데이터:')
    console.log(`  총 ${newsData?.length || 0}개`)
    if (newsData && newsData.length > 0) {
        newsData.forEach((news, idx) => {
            console.log(`\n[뉴스 ${idx + 1}]`)
            console.log(JSON.stringify(news, null, 2))
        })
    } else {
        console.log('  뉴스 데이터 없음')
        console.log('  에러:', newsError)
    }
    
    console.log('\n─'.repeat(80))
    
    const { data: candidateLog, error: logError } = await supabase
        .from('candidate_log')
        .select('*')
        .eq('issue_id', issueId)
    
    console.log('\n📝 후보 생성 로그:')
    console.log(`  총 ${candidateLog?.length || 0}개`)
    if (candidateLog && candidateLog.length > 0) {
        candidateLog.forEach((log, idx) => {
            console.log(`\n[로그 ${idx + 1}]`)
            console.log(JSON.stringify(log, null, 2))
        })
    } else {
        console.log('  로그 없음')
        console.log('  에러:', logError)
    }
    
    const { data: timeline, error: timelineError } = await supabase
        .from('timeline_points')
        .select('*')
        .eq('issue_id', issueId)
        .limit(5)
    
    console.log('\n⏱️ 타임라인 포인트:')
    console.log(`  총 ${timeline?.length || 0}개`)
    if (timeline && timeline.length > 0) {
        timeline.forEach((point, idx) => {
            console.log(`\n[타임라인 ${idx + 1}]`)
            console.log(JSON.stringify(point, null, 2))
        })
    }
}

main().catch(console.error)
