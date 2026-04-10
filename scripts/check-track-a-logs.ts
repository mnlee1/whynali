/**
 * scripts/check-track-a-logs.ts
 * 
 * Track A 로그 분석 (최근 7일)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// .env.local 파일 직접 파싱
const envPath = join(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        if (!process.env[key]) {
            process.env[key] = value
        }
    }
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

async function checkTrackALogs() {
    console.log('=== Track A 로그 분석 (최근 7일) ===\n')
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const { data: logs, error } = await supabaseAdmin
        .from('track_a_logs')
        .select('*')
        .gte('run_at', sevenDaysAgo.toISOString())
        .order('run_at', { ascending: false })
    
    if (error) {
        console.error('에러:', error)
        return
    }
    
    if (!logs || logs.length === 0) {
        console.log('최근 7일간 Track A 로그가 없습니다.')
        console.log('\n원인 가능성:')
        console.log('  1. Track A 크론이 실행되지 않음')
        console.log('  2. 커뮤니티 데이터 수집이 안됨')
        console.log('  3. 급증 키워드가 없음\n')
        
        // 커뮤니티 데이터 확인
        const { data: recentCommunity } = await supabaseAdmin
            .from('community_data')
            .select('id, title, created_at, source_site')
            .gte('updated_at', sevenDaysAgo.toISOString())
            .order('updated_at', { ascending: false })
            .limit(20)
        
        console.log(`\n최근 7일간 커뮤니티 데이터 수집: ${recentCommunity?.length || 0}건`)
        if (recentCommunity && recentCommunity.length > 0) {
            console.log('\n최근 커뮤니티 글 (상위 10개):')
            for (const post of recentCommunity.slice(0, 10)) {
                console.log(`  [${post.source_site}] ${post.title}`)
            }
        }
        
        return
    }
    
    console.log(`총 ${logs.length}건의 로그\n`)
    
    // 결과별 집계
    const resultStats = new Map()
    const categoryStats = new Map()
    
    for (const log of logs) {
        const result = log.result
        if (!resultStats.has(result)) {
            resultStats.set(result, 0)
        }
        resultStats.set(result, resultStats.get(result) + 1)
        
        // AI 검증 통과한 경우 카테고리 통계
        if (log.details?.category) {
            const category = log.details.category
            if (!categoryStats.has(category)) {
                categoryStats.set(category, { total: 0, byResult: new Map() })
            }
            const catStat = categoryStats.get(category)
            catStat.total++
            if (!catStat.byResult.has(result)) {
                catStat.byResult.set(result, 0)
            }
            catStat.byResult.set(result, catStat.byResult.get(result) + 1)
        }
    }
    
    console.log('=== 결과별 집계 ===')
    for (const [result, count] of resultStats.entries()) {
        console.log(`  ${result}: ${count}건`)
    }
    
    console.log('\n=== 카테고리별 집계 ===')
    for (const [category, stats] of categoryStats.entries()) {
        console.log(`\n${category}: 총 ${stats.total}건`)
        for (const [result, count] of stats.byResult.entries()) {
            console.log(`  - ${result}: ${count}건`)
        }
    }
    
    // AI 검증 실패 케이스 (스포츠/기술 중심)
    const aiRejected = logs.filter(l => l.result === 'ai_rejected')
    if (aiRejected.length > 0) {
        const sportsRejected = aiRejected.filter(l => l.details?.category === '스포츠')
        const techRejected = aiRejected.filter(l => l.details?.category === '기술')
        
        if (sportsRejected.length > 0) {
            console.log('\n\n=== 스포츠 카테고리 AI 검증 실패 ===')
            for (const log of sportsRejected.slice(0, 10)) {
                const reason = log.details?.reason || '?'
                const confidence = log.details?.confidence || 0
                console.log(`  "${log.keyword}" (${log.burst_count}건, 신뢰도: ${confidence}%) - ${reason}`)
            }
        }
        
        if (techRejected.length > 0) {
            console.log('\n\n=== 기술 카테고리 AI 검증 실패 ===')
            for (const log of techRejected.slice(0, 10)) {
                const reason = log.details?.reason || '?'
                const confidence = log.details?.confidence || 0
                console.log(`  "${log.keyword}" (${log.burst_count}건, 신뢰도: ${confidence}%) - ${reason}`)
            }
        }
    }
    
    // 뉴스 없음 케이스
    const noNews = logs.filter(l => l.result === 'no_news')
    if (noNews.length > 0) {
        const sportsNoNews = noNews.filter(l => l.details?.category === '스포츠')
        const techNoNews = noNews.filter(l => l.details?.category === '기술')
        
        if (sportsNoNews.length > 0) {
            console.log('\n\n=== 스포츠 카테고리 뉴스 없음 ===')
            for (const log of sportsNoNews.slice(0, 10)) {
                const searchKeyword = log.details?.searchKeyword || log.keyword
                console.log(`  "${log.keyword}" (${log.burst_count}건, 검색어: "${searchKeyword}")`)
            }
        }
        
        if (techNoNews.length > 0) {
            console.log('\n\n=== 기술 카테고리 뉴스 없음 ===')
            for (const log of techNoNews.slice(0, 10)) {
                const searchKeyword = log.details?.searchKeyword || log.keyword
                console.log(`  "${log.keyword}" (${log.burst_count}건, 검색어: "${searchKeyword}")`)
            }
        }
    }
    
    // 성공 케이스
    const success = logs.filter(l => l.result === 'auto_approved' || l.result === 'issue_created')
    if (success.length > 0) {
        const sportsSuccess = success.filter(l => l.details?.category === '스포츠')
        const techSuccess = success.filter(l => l.details?.category === '기술')
        
        console.log('\n\n=== 이슈 등록 성공 ===')
        console.log(`전체: ${success.length}건`)
        console.log(`  스포츠: ${sportsSuccess.length}건`)
        console.log(`  기술: ${techSuccess.length}건`)
        
        if (sportsSuccess.length > 0) {
            console.log('\n스포츠 성공 케이스:')
            for (const log of sportsSuccess) {
                const title = log.details?.finalIssueTitle || '?'
                const heat = log.details?.heatIndex || 0
                console.log(`  "${title}" (화력: ${heat})`)
            }
        }
        
        if (techSuccess.length > 0) {
            console.log('\n기술 성공 케이스:')
            for (const log of techSuccess) {
                const title = log.details?.finalIssueTitle || '?'
                const heat = log.details?.heatIndex || 0
                console.log(`  "${title}" (화력: ${heat})`)
            }
        }
    }
}

checkTrackALogs()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('에러:', e)
        process.exit(1)
    })
