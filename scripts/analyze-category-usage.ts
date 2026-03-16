/**
 * scripts/analyze-category-usage.ts
 * 
 * 카테고리 분류 API 사용량 분석 스크립트
 * AI 전면 전환 시 비용/rate limit 예측
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function analyzeCategoryUsage() {
    console.log('=== 카테고리 분류 AI 사용량 분석 ===\n')

    // 1. 최근 7일간 생성된 이슈 수
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { count: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo)

    console.log(`📊 최근 7일간 생성된 이슈: ${recentIssues}개`)
    console.log(`   → 하루 평균: ${Math.ceil((recentIssues ?? 0) / 7)}개\n`)

    // 2. 카테고리별 분포
    const { data: categoryDist } = await supabaseAdmin
        .from('issues')
        .select('category')
        .gte('created_at', sevenDaysAgo)

    if (categoryDist) {
        const distribution = categoryDist.reduce((acc, item) => {
            const cat = item.category ?? '미분류'
            acc[cat] = (acc[cat] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        console.log('📈 카테고리별 분포:')
        Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, count]) => {
                const percentage = ((count / (recentIssues ?? 1)) * 100).toFixed(1)
                console.log(`   ${cat}: ${count}개 (${percentage}%)`)
            })
        console.log('')
    }

    // 3. Groq API 사용량 예측
    const dailyIssues = Math.ceil((recentIssues ?? 0) / 7)
    
    console.log('🤖 Groq AI 전면 전환 시 예측\n')
    
    // 토큰 소비 예측
    const avgTitlesPerIssue = 5  // 이슈당 평균 제목 수
    const avgTokensPerTitle = 30  // 제목당 평균 토큰 수
    const responseTokens = 100    // AI 응답 토큰 수
    
    const tokensPerIssue = (avgTitlesPerIssue * avgTokensPerTitle) + responseTokens
    const dailyTokens = dailyIssues * tokensPerIssue
    
    console.log(`토큰 소비 예측:`)
    console.log(`   이슈당 소비: ~${tokensPerIssue} 토큰`)
    console.log(`   하루 소비: ~${dailyTokens.toLocaleString()} 토큰`)
    console.log(`   한달 소비: ~${(dailyTokens * 30).toLocaleString()} 토큰\n`)
    
    // Groq 무료 플랜 제한
    const groqDailyLimit = 500000  // 하루 50만 토큰
    const groqMonthlyLimit = 15000000  // 한달 1500만 토큰 (추정)
    
    const dailyUsagePercent = ((dailyTokens / groqDailyLimit) * 100).toFixed(1)
    const monthlyUsagePercent = ((dailyTokens * 30 / groqMonthlyLimit) * 100).toFixed(1)
    
    console.log(`Groq 무료 플랜 (하루 50만 토큰) 대비:`)
    console.log(`   하루 사용률: ${dailyUsagePercent}%`)
    console.log(`   한달 사용률: ${monthlyUsagePercent}% (추정)\n`)
    
    if (dailyTokens < groqDailyLimit * 0.5) {
        console.log('✅ Groq 무료 플랜으로 충분히 감당 가능합니다!')
        console.log('   → AI 전면 전환 권장\n')
    } else if (dailyTokens < groqDailyLimit) {
        console.log('⚠️  Groq 무료 플랜으로 가능하나 여유가 적습니다.')
        console.log('   → AI 전환 가능하나 캐싱 전략 추가 권장\n')
    } else {
        console.log('❌ Groq 무료 플랜으로는 부족합니다.')
        console.log('   → 유료 플랜 전환 또는 하이브리드 방식 유지 필요\n')
    }

    // 4. 현재 하이브리드 방식 vs AI 전면 전환 비교
    console.log('━'.repeat(80))
    console.log('\n📋 방식 비교\n')
    
    console.log('현재 방식 (하이브리드):')
    console.log('  장점:')
    console.log('    - API 호출 최소화 (신뢰도 낮을 때만)')
    console.log('    - 빠른 응답 속도')
    console.log('  단점:')
    console.log('    - 키워드 유지보수 필요 ❌')
    console.log('    - 새로운 케이스마다 키워드 추가 ❌')
    console.log('    - 맥락 이해 부족으로 오분류 발생 ❌\n')
    
    console.log('AI 전면 전환:')
    console.log('  장점:')
    console.log('    - 키워드 유지보수 불필요 ✅')
    console.log('    - 맥락 이해로 정확도 향상 ✅')
    console.log('    - 새로운 케이스 자동 대응 ✅')
    console.log('  단점:')
    console.log('    - API 호출 증가 (하루 ~${dailyIssues}회)')
    console.log('    - 응답 속도 약간 느림 (1-2초)\n')
    
    if (dailyTokens < groqDailyLimit * 0.3) {
        console.log('💡 추천: AI 전면 전환')
        console.log('   → 현재 이슈 생성량이 적어 API 비용 부담 없음')
        console.log('   → 유지보수 간편화 효과가 큼\n')
    }

    // 5. 구현 방안
    console.log('━'.repeat(80))
    console.log('\n🛠️  AI 전면 전환 구현 방안\n')
    
    console.log('Option 1: 즉시 전환 (권장)')
    console.log('  - shouldUseAIClassification를 항상 true로 변경')
    console.log('  - 또는 inferCategory에서 키워드 분류 스킵하고 AI만 사용')
    console.log('  - 구현 난이도: 쉬움 (10분)')
    console.log('  - 토큰 사용량: 하루 ~${dailyTokens.toLocaleString()}\n')
    
    console.log('Option 2: 캐싱 추가 후 전환')
    console.log('  - 비슷한 제목은 캐시에서 재사용')
    console.log('  - 토큰 사용량 30-50% 절감')
    console.log('  - 구현 난이도: 보통 (1-2시간)')
    console.log('  - 토큰 사용량: 하루 ~${Math.floor(dailyTokens * 0.6).toLocaleString()}\n')
    
    console.log('Option 3: 환경변수로 전환 가능하도록')
    console.log('  - CATEGORY_STRATEGY=ai|hybrid|keyword')
    console.log('  - 상황에 따라 전략 변경 가능')
    console.log('  - 구현 난이도: 보통 (1시간)')
    console.log('  - 유연성: 높음\n')
}

analyzeCategoryUsage().catch(console.error)
