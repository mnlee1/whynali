/**
 * scripts/analyze_track_a_funnel.ts
 * 
 * [트랙A 퍼널 분석]
 * 
 * 커뮤니티 급증 감지 → AI 검증 → 뉴스 검색 → 이슈 생성 각 단계의
 * 전환율을 분석하여 병목 구간을 찾습니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function analyzeTrackAFunnel() {
    console.log('═'.repeat(80))
    console.log('트랙A 퍼널 분석')
    console.log('═'.repeat(80))
    console.log('')

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // 1. 커뮤니티 데이터 수집
    console.log('1️⃣  퍼널 단계별 분석')
    console.log('─'.repeat(80))

    const { count: totalCommunityPosts } = await supabase
        .from('community_data')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last24Hours.toISOString())

    console.log(`[1단계] 커뮤니티 글 수집: ${totalCommunityPosts ?? 0}건`)

    // 2. 키워드 그룹 추출 (급증 감지 시뮬레이션)
    // 실제로는 트랙A 크론이 키워드 그룹을 만들지만, 여기서는 추정
    const { data: recentPosts } = await supabase
        .from('community_data')
        .select('title, created_at')
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })
        .limit(500)

    // 간단한 키워드 추출 (실제 트랙A와 다를 수 있음)
    const keywordCounts: Record<string, number> = {}
    recentPosts?.forEach(post => {
        const words = post.title.split(/\s+/).filter(w => w.length >= 2)
        words.slice(0, 3).forEach(word => {
            keywordCounts[word] = (keywordCounts[word] || 0) + 1
        })
    })

    const BURST_THRESHOLD = parseInt(process.env.COMMUNITY_BURST_THRESHOLD ?? '10')
    const burstKeywords = Object.entries(keywordCounts)
        .filter(([_, count]) => count >= BURST_THRESHOLD)
        .sort((a, b) => b[1] - a[1])

    console.log(`[2단계] 급증 감지 (임계값 ${BURST_THRESHOLD}건): ${burstKeywords.length}개 키워드`)
    
    if (burstKeywords.length > 0) {
        console.log('\n상위 급증 키워드:')
        burstKeywords.slice(0, 5).forEach(([keyword, count]) => {
            console.log(`  - "${keyword}": ${count}건`)
        })
    }

    // 3. 실제 생성된 트랙A 이슈
    const { data: trackAIssues } = await supabase
        .from('issues')
        .select('id, title, created_at')
        .eq('source_track', 'track_a')
        .gte('created_at', last24Hours.toISOString())

    const issueCount = trackAIssues?.length ?? 0
    console.log(`\n[최종] 생성된 이슈: ${issueCount}개`)

    // 4. 전환율 계산
    console.log('')
    console.log('2️⃣  전환율 분석')
    console.log('─'.repeat(80))

    if (burstKeywords.length > 0) {
        const conversionRate = (issueCount / burstKeywords.length) * 100
        console.log(`급증 키워드 → 이슈: ${conversionRate.toFixed(1)}% (${issueCount}/${burstKeywords.length})`)

        if (conversionRate < 10) {
            console.log('\n⚠️  경고: 전환율이 10% 미만입니다!')
            console.log('   → AI 검증이 너무 엄격하거나 뉴스 검색이 실패하는 경우가 많습니다.')
        } else if (conversionRate < 30) {
            console.log('\n⚠️  전환율이 낮습니다. 개선 여지가 있습니다.')
        } else {
            console.log('\n✅ 전환율이 양호합니다.')
        }
    } else {
        console.log('급증 감지된 키워드가 없습니다.')
        console.log('→ 커뮤니티 급증 감지 임계값이 너무 높을 수 있습니다.')
    }

    // 5. 생성된 이슈 상세
    if (trackAIssues && trackAIssues.length > 0) {
        console.log('')
        console.log('3️⃣  생성된 이슈 상세')
        console.log('─'.repeat(80))

        for (const issue of trackAIssues) {
            const { count: commCount } = await supabase
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issue.id)

            const { count: newsCount } = await supabase
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issue.id)

            console.log(`\n• ${issue.title}`)
            console.log(`  커뮤니티: ${commCount ?? 0}건, 뉴스: ${newsCount ?? 0}건`)
            console.log(`  생성: ${issue.created_at}`)
        }
    }

    // 6. 권장 조치
    console.log('')
    console.log('═'.repeat(80))
    console.log('권장 조치')
    console.log('═'.repeat(80))

    if (burstKeywords.length === 0) {
        console.log('\n1. 커뮤니티 급증 감지 임계값 낮추기:')
        console.log(`   현재: COMMUNITY_BURST_THRESHOLD=${BURST_THRESHOLD}`)
        console.log('   권장: COMMUNITY_BURST_THRESHOLD=5')
    } else if (burstKeywords.length > 0 && issueCount === 0) {
        console.log('\n1. AI 검증 또는 뉴스 검색 단계 확인:')
        console.log('   - AI가 모든 키워드를 거부하는지 확인')
        console.log('   - 네이버 뉴스 검색이 실패하는지 확인')
        console.log('   - Rate Limit에 걸려서 중단되었는지 확인')
    } else if (burstKeywords.length > 10 && issueCount < 3) {
        console.log('\n1. 전환율 개선:')
        console.log('   - AI 검증 신뢰도 임계값 낮추기')
        console.log('   - 뉴스 검색 키워드 확장')
        console.log('   - 중복 체크 완화')
    }

    console.log('')
}

analyzeTrackAFunnel().catch(console.error)
