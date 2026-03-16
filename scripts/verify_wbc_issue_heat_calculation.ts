/**
 * scripts/verify_wbc_issue_heat_calculation.ts
 * 
 * WBC 이슈의 화력 계산 로직 검증
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 화력 계산 로직 검증 ===\n')

    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'

    // 1. 연결 데이터 조회
    const [communityResult, newsResult] = await Promise.all([
        supabaseAdmin
            .from('community_data')
            .select('view_count, comment_count, created_at')
            .eq('issue_id', issueId),
        supabaseAdmin
            .from('news_data')
            .select('source, title, created_at')
            .eq('issue_id', issueId),
    ])

    const communityData = communityResult.data ?? []
    const newsData = newsResult.data ?? []

    console.log('[ 1. 연결 데이터 ]')
    console.log(`커뮤니티: ${communityData.length}개`)
    console.log(`뉴스: ${newsData.length}개`)
    console.log()

    // 2. 커뮤니티 화력 계산
    let communityHeat = 0
    if (communityData.length > 0) {
        const totalViews = communityData.reduce((sum, d) => sum + (d.view_count ?? 0), 0)
        const totalComments = communityData.reduce((sum, d) => sum + (d.comment_count ?? 0), 0)
        const viewScore = Math.min(100, (totalViews / 5000) * 100)
        const commentScore = Math.min(100, (totalComments / 500) * 100)
        const raw = viewScore * 0.35 + commentScore * 0.45
        communityHeat = Math.min(100, Math.max(0, Math.round(raw)))
    }

    console.log('[ 2. 커뮤니티 화력 ]')
    console.log(`communityHeat: ${communityHeat}점`)
    console.log()

    // 3. 뉴스 신뢰도 계산
    let newsCredibility = 0
    if (newsData.length > 0) {
        const uniqueSources = new Set(newsData.map((d) => d.source)).size
        const sourceScore = (Math.min(20, uniqueSources) / 20) * 100
        const countScore = Math.min(100, newsData.length * 2)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
        
        console.log('[ 3. 뉴스 신뢰도 계산 ]')
        console.log(`뉴스 개수: ${newsData.length}개`)
        console.log(`출처 다양성: ${uniqueSources}개`)
        console.log(`sourceScore: ${sourceScore.toFixed(2)}점 (출처 다양성 × 0.6)`)
        console.log(`countScore: ${countScore.toFixed(2)}점 (뉴스 개수 × 2 × 0.4)`)
        console.log(`newsCredibility: ${newsCredibility}점`)
        console.log()
    }

    // 4. 커뮤니티 증폭 계수
    const communityAmp = communityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))

    console.log('[ 4. 커뮤니티 증폭 계수 ]')
    console.log(`communityAmp: ${communityAmp.toFixed(4)}`)
    if (communityAmp === 0) {
        console.log('→ 커뮤니티 반응 없음 (최대 30점 제한)')
    }
    console.log()

    // 5. 최종 화력 계산
    const heatIndex = Math.round(
        Math.min(100, Math.max(0, newsCredibility * (0.3 + 0.7 * communityAmp)))
    )

    console.log('[ 5. 최종 화력 계산 ]')
    console.log(`공식: newsCredibility × (0.3 + 0.7 × communityAmp)`)
    console.log(`     = ${newsCredibility} × (0.3 + 0.7 × ${communityAmp.toFixed(4)})`)
    console.log(`     = ${newsCredibility} × ${(0.3 + 0.7 * communityAmp).toFixed(4)}`)
    console.log(`     = ${heatIndex}점`)
    console.log()

    // 6. DB 저장값과 비교
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('heat_index')
        .eq('id', issueId)
        .single()

    console.log('[ 6. 검증 ]')
    console.log(`계산된 화력: ${heatIndex}점`)
    console.log(`DB 저장 화력: ${issue?.heat_index}점`)
    console.log(`일치 여부: ${heatIndex === issue?.heat_index ? '✅ 일치' : '❌ 불일치'}`)
    console.log()

    // 7. 자동 반려 조건 확인
    const minHeat = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')
    
    console.log('[ 7. 자동 반려 조건 확인 ]')
    console.log(`최소 화력 기준: ${minHeat}점`)
    console.log(`계산된 화력: ${heatIndex}점`)
    console.log()
    
    if (heatIndex < minHeat) {
        console.log(`✅ ${heatIndex}점 < ${minHeat}점 → 자동 반려 정상`)
    } else {
        console.log(`❌ ${heatIndex}점 ≥ ${minHeat}점 → 반려되면 안됨 (버그)`)
    }
    console.log()

    // 8. 뉴스 관련성 분석
    console.log('[ 8. 뉴스 관련성 분석 ]')
    const relevantNews = newsData.filter(n => 
        n.title.includes('대만') || 
        n.title.includes('혐한') || 
        n.title.includes('WBC') ||
        n.title.includes('월드베이스볼')
    )
    
    console.log(`관련 뉴스: ${relevantNews.length}개`)
    console.log(`무관 뉴스: ${newsData.length - relevantNews.length}개`)
    console.log()
    
    if (relevantNews.length !== newsData.length) {
        console.log('⚠️ 무관한 뉴스가 연결되어 화력이 부풀려졌습니다.')
        console.log()
        console.log('관련 뉴스만 재계산:')
        const cleanNewsCredibility = Math.round(
            (Math.min(relevantNews.length, 10) / 20) * 100 * 0.6 + 
            Math.min(100, relevantNews.length * 2) * 0.4
        )
        const cleanHeat = Math.round(cleanNewsCredibility * 0.3)
        console.log(`  newsCredibility: ${cleanNewsCredibility}점`)
        console.log(`  최종 화력: ${cleanHeat}점`)
        console.log(`  기준 충족: ${cleanHeat >= minHeat ? '✅' : '❌'}`)
    }
}

main().catch(console.error)
