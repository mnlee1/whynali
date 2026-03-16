/**
 * scripts/check-category-issues.ts
 * 
 * 연예/정치 카테고리 이슈 등록 현황 검증
 * 실제로 논란성 이슈가 제대로 등록되고 있는지 확인
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkCategoryIssues() {
    console.log('='.repeat(60))
    console.log('연예/정치 카테고리 이슈 등록 검증')
    console.log('='.repeat(60))
    console.log()

    // 1. 전체 카테고리별 이슈 통계
    const { data: allIssues } = await supabase
        .from('issues')
        .select('id, category, approval_status, heat_index, status')
        .order('created_at', { ascending: false })

    if (!allIssues) {
        console.log('❌ 이슈 조회 실패')
        return
    }

    // 카테고리별 집계
    const categoryStats: Record<string, {
        total: number
        pending: number
        approved: number
        rejected: number
        avgHeat: number
        heatSum: number
    }> = {}

    allIssues.forEach(issue => {
        if (!categoryStats[issue.category]) {
            categoryStats[issue.category] = {
                total: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                avgHeat: 0,
                heatSum: 0
            }
        }
        const stat = categoryStats[issue.category]
        stat.total++
        stat.heatSum += issue.heat_index || 0

        if (issue.approval_status === '대기') stat.pending++
        if (issue.approval_status === '승인') stat.approved++
        if (issue.approval_status === '반려') stat.rejected++
    })

    // 평균 화력 계산
    Object.keys(categoryStats).forEach(cat => {
        categoryStats[cat].avgHeat = categoryStats[cat].heatSum / categoryStats[cat].total
    })

    console.log('📊 카테고리별 이슈 현황')
    console.log('-'.repeat(60))
    console.log('카테고리 | 전체 | 대기 | 승인 | 반려 | 평균화력')
    console.log('-'.repeat(60))
    
    const categories = ['연예', '정치', '사회', '경제', 'IT과학', '생활문화', '세계', '스포츠']
    categories.forEach(cat => {
        const stat = categoryStats[cat] || { total: 0, pending: 0, approved: 0, rejected: 0, avgHeat: 0 }
        console.log(`${cat.padEnd(8)} | ${String(stat.total).padStart(4)} | ${String(stat.pending).padStart(4)} | ${String(stat.approved).padStart(4)} | ${String(stat.rejected).padStart(4)} | ${stat.avgHeat.toFixed(1).padStart(6)}점`)
    })
    console.log()

    // 2. 연예/정치 최근 이슈 샘플 확인
    console.log('📰 연예 카테고리 최근 이슈 (최근 10건)')
    console.log('-'.repeat(60))
    const { data: entertainmentIssues } = await supabase
        .from('issues')
        .select('title, approval_status, heat_index, created_at')
        .eq('category', '연예')
        .order('created_at', { ascending: false })
        .limit(10)

    if (entertainmentIssues && entertainmentIssues.length > 0) {
        entertainmentIssues.forEach((issue, idx) => {
            console.log(`${idx + 1}. [${issue.approval_status}] ${issue.title}`)
            console.log(`   화력: ${issue.heat_index?.toFixed(1) || 0}점 | 생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        })
    } else {
        console.log('❌ 연예 카테고리 이슈 없음')
    }
    console.log()

    console.log('🏛️ 정치 카테고리 최근 이슈 (최근 10건)')
    console.log('-'.repeat(60))
    const { data: politicsIssues } = await supabase
        .from('issues')
        .select('title, approval_status, heat_index, created_at')
        .eq('category', '정치')
        .order('created_at', { ascending: false })
        .limit(10)

    if (politicsIssues && politicsIssues.length > 0) {
        politicsIssues.forEach((issue, idx) => {
            console.log(`${idx + 1}. [${issue.approval_status}] ${issue.title}`)
            console.log(`   화력: ${issue.heat_index?.toFixed(1) || 0}점 | 생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        })
    } else {
        console.log('❌ 정치 카테고리 이슈 없음')
    }
    console.log()

    // 3. 연예/정치 화력 30점 이상 대기 중인 긴급 이슈 확인
    console.log('🔥 긴급 처리 필요 이슈 (화력 30점 이상 + 대기 중)')
    console.log('-'.repeat(60))
    const { data: urgentIssues } = await supabase
        .from('issues')
        .select('title, category, heat_index, created_at')
        .eq('approval_status', '대기')
        .gte('heat_index', 30)
        .in('category', ['연예', '정치'])
        .order('heat_index', { ascending: false })

    if (urgentIssues && urgentIssues.length > 0) {
        console.log(`⚠️ ${urgentIssues.length}건 발견 - Dooray 알림 대상`)
        urgentIssues.forEach((issue, idx) => {
            console.log(`${idx + 1}. [${issue.category}] ${issue.title}`)
            console.log(`   화력: ${issue.heat_index?.toFixed(1)}점 | 대기: ${Math.floor((Date.now() - new Date(issue.created_at).getTime()) / 3600000)}시간`)
        })
    } else {
        console.log('✅ 긴급 처리 필요 이슈 없음')
    }
    console.log()

    // 4. 수집 데이터 중 연예/정치 비율 확인
    console.log('📡 최근 수집 데이터 (24시간)')
    console.log('-'.repeat(60))
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    
    const { data: newsData } = await supabase
        .from('news_data')
        .select('category')
        .gte('created_at', oneDayAgo)

    const newsByCategory: Record<string, number> = {}
    newsData?.forEach(news => {
        newsByCategory[news.category] = (newsByCategory[news.category] || 0) + 1
    })

    console.log('뉴스 수집:')
    categories.forEach(cat => {
        const count = newsByCategory[cat] || 0
        console.log(`  ${cat}: ${count}건`)
    })
    console.log()

    // 5. 문제점 분석
    console.log('🔍 분석 결과')
    console.log('-'.repeat(60))
    
    const entertainmentStat = categoryStats['연예'] || { total: 0, approved: 0, avgHeat: 0 }
    const politicsStat = categoryStats['정치'] || { total: 0, approved: 0, avgHeat: 0 }
    
    if (entertainmentStat.total === 0) {
        console.log('❌ 연예 카테고리 이슈가 전혀 등록되지 않음')
        console.log('   원인: 뉴스 수집 부족 or 카테고리 분류 오류 or 화력 기준 미달')
    } else if (entertainmentStat.total < 5) {
        console.log('⚠️ 연예 카테고리 이슈가 너무 적음 (5건 미만)')
        console.log('   실제 논란이 많은 카테고리인데 등록이 부족함')
    } else {
        console.log(`✅ 연예 카테고리 이슈 ${entertainmentStat.total}건 등록됨`)
    }

    if (politicsStat.total === 0) {
        console.log('❌ 정치 카테고리 이슈가 전혀 등록되지 않음')
        console.log('   원인: 뉴스 수집 부족 or 카테고리 분류 오류 or 화력 기준 미달')
    } else if (politicsStat.total < 5) {
        console.log('⚠️ 정치 카테고리 이슈가 너무 적음 (5건 미만)')
        console.log('   실제 논란이 많은 카테고리인데 등록이 부족함')
    } else {
        console.log(`✅ 정치 카테고리 이슈 ${politicsStat.total}건 등록됨`)
    }

    const totalEntPol = entertainmentStat.total + politicsStat.total
    const totalAll = allIssues.length
    const ratio = (totalEntPol / totalAll * 100)

    console.log()
    console.log(`📊 연예+정치 비율: ${totalEntPol}/${totalAll} (${ratio.toFixed(1)}%)`)
    
    if (ratio < 20) {
        console.log('⚠️ 논란성 카테고리 비율이 너무 낮음 (<20%)')
        console.log('   왜난리의 핵심 가치인 "논란 빠르게 확인"에 문제 있음')
    } else {
        console.log('✅ 논란성 카테고리 비율 적절함')
    }

    console.log()
    console.log('💡 권장 사항')
    console.log('-'.repeat(60))
    console.log('1. 연예/정치 뉴스 수집이 충분한지 확인')
    console.log('2. AI 카테고리 분류가 정확한지 확인')
    console.log('3. 화력 15점 기준이 적절한지 검토')
    console.log('4. 급증 감지 시스템이 제대로 동작하는지 확인')
    console.log()
}

checkCategoryIssues()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('에러:', err)
        process.exit(1)
    })
