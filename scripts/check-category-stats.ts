/**
 * scripts/check-category-stats.ts
 * 
 * 스포츠와 기술 카테고리 이슈 등록 현황 분석
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

async function checkCategoryStats() {
    console.log('=== 최근 7일 카테고리별 이슈 현황 ===\n')
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, heat_index, created_at, source_track')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
    
    if (error) {
        console.error('에러:', error)
        return
    }
    
    // 카테고리별 집계
    const categoryStats = new Map()
    
    for (const issue of issues || []) {
        if (!categoryStats.has(issue.category)) {
            categoryStats.set(issue.category, { 
                total: 0, 
                approved: 0, 
                pending: 0,
                rejected: 0 
            })
        }
        const stats = categoryStats.get(issue.category)
        stats.total++
        
        if (issue.approval_status === '승인') stats.approved++
        else if (issue.approval_status === '대기') stats.pending++
        else if (issue.approval_status === '반려') stats.rejected++
    }
    
    // 출력
    console.log('카테고리별 이슈 수:')
    for (const [category, stats] of categoryStats.entries()) {
        console.log(`  ${category}: ${stats.total}건 (승인: ${stats.approved}, 대기: ${stats.pending}, 반려: ${stats.rejected})`)
    }
    
    console.log(`\n전체: ${issues?.length || 0}건`)
    
    // 스포츠 이슈 상세
    console.log('\n\n=== 스포츠 이슈 ===')
    const sportsIssues = issues?.filter(i => i.category === '스포츠') || []
    console.log(`총 ${sportsIssues.length}건\n`)
    for (const issue of sportsIssues.slice(0, 10)) {
        console.log(`  [${issue.approval_status}] ${issue.title} (화력: ${issue.heat_index})`)
    }
    
    // 기술 이슈 상세
    console.log('\n\n=== 기술 이슈 ===')
    const techIssues = issues?.filter(i => i.category === '기술') || []
    console.log(`총 ${techIssues.length}건\n`)
    for (const issue of techIssues.slice(0, 10)) {
        console.log(`  [${issue.approval_status}] ${issue.title} (화력: ${issue.heat_index})`)
    }
    
    // track_a_logs 확인 (최근 24시간)
    console.log('\n\n=== Track A 로그 (최근 24시간) ===')
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)
    
    const { data: logs } = await supabaseAdmin
        .from('track_a_logs')
        .select('keyword, burst_count, result, details')
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50)
    
    if (logs) {
        // 결과별 집계
        const resultStats = new Map()
        for (const log of logs) {
            const result = log.result
            if (!resultStats.has(result)) {
                resultStats.set(result, 0)
            }
            resultStats.set(result, resultStats.get(result) + 1)
        }
        
        console.log('결과별 집계:')
        for (const [result, count] of resultStats.entries()) {
            console.log(`  ${result}: ${count}건`)
        }
        
        // AI 검증 실패 케이스 분석
        const aiRejected = logs.filter(l => l.result === 'ai_rejected')
        if (aiRejected.length > 0) {
            console.log('\n\nAI 검증 실패 케이스 (상위 10개):')
            for (const log of aiRejected.slice(0, 10)) {
                const category = log.details?.category || '?'
                const reason = log.details?.reason || '?'
                console.log(`  "${log.keyword}" (${log.burst_count}건, 카테고리: ${category}) - ${reason}`)
            }
        }
        
        // 뉴스 없음 케이스
        const noNews = logs.filter(l => l.result === 'no_news')
        if (noNews.length > 0) {
            console.log('\n\n뉴스 없음 케이스 (상위 10개):')
            for (const log of noNews.slice(0, 10)) {
                const category = log.details?.category || '?'
                console.log(`  "${log.keyword}" (${log.burst_count}건, 카테고리: ${category})`)
            }
        }
    }
}

checkCategoryStats()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('에러:', e)
        process.exit(1)
    })
