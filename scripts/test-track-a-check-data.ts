/**
 * scripts/test-track-a-check-data.ts
 * 
 * [트랙 A 테스트 전 데이터 상태 확인]
 * 
 * 커뮤니티 데이터가 충분히 있는지, 급증 패턴이 있는지 확인합니다.
 * 
 * 실행:
 * npx tsx scripts/test-track-a-check-data.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// .env.local 로드
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkDataForTest() {
    console.log('\n📊 트랙 A 테스트 데이터 상태 확인\n')
    
    const WINDOW_MINUTES = parseInt(process.env.COMMUNITY_BURST_WINDOW_MINUTES ?? '10')
    const BURST_THRESHOLD = parseInt(process.env.COMMUNITY_BURST_THRESHOLD ?? '10')
    
    const cutoffTime = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
    
    // 1. 최근 커뮤니티 수집 건수
    const { data: recentPosts, error } = await supabase
        .from('community_data')
        .select('id, title, created_at')
        .gte('created_at', cutoffTime)
        .is('issue_id', null)
        .order('created_at', { ascending: false })
    
    if (error) {
        console.error('❌ 커뮤니티 데이터 조회 실패:', error)
        process.exit(1)
    }
    
    console.log(`⏰ 시간 범위: 최근 ${WINDOW_MINUTES}분`)
    console.log(`📈 급증 임계값: ${BURST_THRESHOLD}건`)
    console.log(`📦 최근 수집 건수: ${recentPosts?.length ?? 0}건`)
    
    if (!recentPosts || recentPosts.length === 0) {
        console.log('\n⚠️  최근 커뮤니티 데이터가 없습니다!')
        console.log('\n해결 방법:')
        console.log('1. 커뮤니티 수집 크론 실행: POST /api/cron/collect-community')
        console.log('2. COMMUNITY_BURST_WINDOW_MINUTES 값을 늘리기 (예: 60)')
        console.log('3. 수동으로 community_data에 테스트 데이터 추가')
        return
    }
    
    // 2. 키워드 빈도 분석
    const keywordMap = new Map<string, number>()
    
    for (const post of recentPosts) {
        // 간단한 토큰화 (공백 기준)
        const words = post.title
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 1)
        
        for (const word of words) {
            keywordMap.set(word, (keywordMap.get(word) || 0) + 1)
        }
    }
    
    // 급증 키워드 필터링
    const burstKeywords = Array.from(keywordMap.entries())
        .filter(([_, count]) => count >= BURST_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
    
    console.log(`\n🔥 급증 키워드 (${BURST_THRESHOLD}건 이상): ${burstKeywords.length}개\n`)
    
    if (burstKeywords.length === 0) {
        console.log('⚠️  급증 키워드가 없습니다.')
        console.log('\n해결 방법:')
        console.log(`1. COMMUNITY_BURST_THRESHOLD 값을 낮추기 (현재: ${BURST_THRESHOLD})`)
        console.log('2. 커뮤니티 데이터 더 수집하기')
        console.log('3. COMMUNITY_BURST_WINDOW_MINUTES 값을 늘리기')
    } else {
        console.log('✅ 트랙 A 테스트 가능!')
        console.log('\n상위 급증 키워드:')
        
        for (const [keyword, count] of burstKeywords.slice(0, 10)) {
            console.log(`  • "${keyword}": ${count}건`)
        }
        
        console.log('\n예상 결과:')
        console.log(`- 최대 ${Math.min(burstKeywords.length, 3)}개 키워드 처리 (Rate Limit)`)
        console.log('- AI 검증 → 뉴스 검색 → 이슈 생성')
    }
    
    // 3. 기존 이슈 개수
    const { count: issueCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
    
    console.log(`\n📊 현재 이슈 개수: ${issueCount}개`)
    
    if (issueCount && issueCount > 0) {
        console.log('\n💡 팁: 깨끗한 테스트를 원하면 리셋 스크립트 실행')
        console.log('   CONFIRM_RESET=yes npx tsx scripts/test-track-a-reset.ts')
    }
    
    console.log('\n')
}

checkDataForTest().catch(console.error)
