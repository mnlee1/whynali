/**
 * scripts/check_wbc_time_weighted_heat.ts
 * 
 * WBC 이슈의 시간 가중 화력 계산 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 시간 가중 화력 계산 ===\n')

    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'

    // 뉴스 데이터 조회
    const { data: newsData } = await supabaseAdmin
        .from('news_data')
        .select('source, title, created_at, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: false })

    if (!newsData || newsData.length === 0) {
        console.log('뉴스 데이터 없음')
        return
    }

    console.log(`총 뉴스: ${newsData.length}개\n`)

    // 시간 가중치 함수
    function getTimeWeight(createdAt: string): number {
        const age = Date.now() - new Date(createdAt).getTime()
        const daysSinceCreated = age / (1000 * 60 * 60 * 24)
        
        if (daysSinceCreated <= 7) return 1.0
        if (daysSinceCreated >= 30) return 0.1
        return 1.0 - ((daysSinceCreated - 7) / 23) * 0.9
    }

    // 뉴스별 가중치 계산
    console.log('[ 뉴스별 시간 가중치 ]')
    console.log()
    
    let totalWeight = 0
    const weightedSources = new Map<string, number>()
    
    newsData.forEach((news, idx) => {
        const weight = getTimeWeight(news.created_at)
        totalWeight += weight
        
        const currentWeight = weightedSources.get(news.source) || 0
        weightedSources.set(news.source, currentWeight + weight)
        
        const age = Date.now() - new Date(news.created_at).getTime()
        const days = (age / (1000 * 60 * 60 * 24)).toFixed(1)
        
        const isRelevant = 
            news.title.includes('대만') || 
            news.title.includes('혐한') || 
            news.title.includes('WBC') ||
            news.title.includes('월드베이스볼')
        
        console.log(`${idx + 1}. ${isRelevant ? '✅' : '❌'} [가중치: ${weight.toFixed(3)}] (${days}일 전)`)
        console.log(`   ${news.title.substring(0, 60)}...`)
        console.log()
    })

    // 출처 다양성 (가중치 적용)
    const effectiveSources = Array.from(weightedSources.values())
        .reduce((sum, w) => sum + Math.min(1, w), 0)

    console.log('[ 시간 가중 화력 계산 ]')
    console.log()
    console.log(`가중 뉴스 개수: ${totalWeight.toFixed(2)}`)
    console.log(`가중 출처 다양성: ${effectiveSources.toFixed(2)}`)
    console.log()

    // newsCredibility 계산 (시간 가중)
    const sourceScore = (Math.min(20, effectiveSources) / 20) * 100
    const countScore = Math.min(100, totalWeight * 2)
    const newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))

    console.log(`sourceScore: ${sourceScore.toFixed(2)}점`)
    console.log(`countScore: ${countScore.toFixed(2)}점`)
    console.log(`newsCredibility: ${newsCredibility}점`)
    console.log()

    // 최종 화력 (커뮤니티 없음)
    const heatIndex = Math.round(newsCredibility * 0.3)
    
    console.log(`최종 화력 (시간 가중): ${heatIndex}점`)
    console.log()

    // 자동 반려 조건
    const minHeat = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')
    console.log('[ 자동 반려 조건 ]')
    console.log(`최소 기준: ${minHeat}점`)
    console.log(`시간 가중 화력: ${heatIndex}점`)
    
    if (heatIndex < minHeat) {
        console.log(`✅ ${heatIndex}점 < ${minHeat}점 → 자동 반려 정상`)
    } else {
        console.log(`❌ ${heatIndex}점 ≥ ${minHeat}점 → 반려되면 안됨`)
    }
    console.log()

    // 이슈 생성/수정 시각 확인
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('created_at, updated_at')
        .eq('id', issueId)
        .single()

    if (issue) {
        console.log('[ 타임라인 ]')
        console.log(`이슈 생성: ${issue.created_at}`)
        console.log(`최종 수정: ${issue.updated_at}`)
        
        const createTime = new Date(issue.created_at).getTime()
        const updateTime = new Date(issue.updated_at).getTime()
        const diffHours = ((updateTime - createTime) / (1000 * 60 * 60)).toFixed(1)
        
        console.log(`경과 시간: ${diffHours}시간`)
        console.log()
        
        // 뉴스 수집 시각과 비교
        const oldestNews = new Date(newsData[newsData.length - 1].created_at)
        const issueCreate = new Date(issue.created_at)
        
        if (oldestNews < issueCreate) {
            console.log('⚠️ 뉴스가 이슈 생성 전에 수집됨')
            console.log(`   가장 오래된 뉴스: ${newsData[newsData.length - 1].created_at}`)
            console.log(`   이슈 생성 시각: ${issue.created_at}`)
        }
    }
}

main().catch(console.error)
