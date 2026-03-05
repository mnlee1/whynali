/**
 * scripts/test-token-tracking.ts
 *
 * API 토큰 사용량 추적 기능 테스트
 *
 * 실행:
 * npx tsx scripts/test-token-tracking.ts
 */

import { incrementApiUsage, getAllApiCostsSummary } from '@/lib/api-usage-tracker'

async function main() {
    console.log('=== API 토큰 사용량 추적 테스트 ===\n')

    // 1. 테스트 데이터 추가
    console.log('1. 테스트 데이터 추가 중...')
    await incrementApiUsage('perplexity', {
        calls: 1,
        successes: 1,
        failures: 0,
        inputTokens: 500,
        outputTokens: 200,
    })
    console.log('✓ 테스트 데이터 추가 완료\n')

    // 2. 전체 API 비용 요약 조회
    console.log('2. API 비용 요약 조회 중...')
    const summary = await getAllApiCostsSummary()
    console.log('\n=== API 비용 요약 ===')
    console.log(JSON.stringify(summary, null, 2))

    // 3. Perplexity 토큰 정보 확인
    console.log('\n=== Perplexity 토큰 사용량 ===')
    console.log('오늘:')
    console.log(`  호출: ${summary.perplexity.calls.today}회`)
    console.log(`  입력 토큰: ${summary.perplexity.tokens.today.input.toLocaleString()}`)
    console.log(`  출력 토큰: ${summary.perplexity.tokens.today.output.toLocaleString()}`)
    console.log(`  전체 토큰: ${summary.perplexity.tokens.today.total.toLocaleString()}`)
    console.log(`  비용: $${summary.perplexity.today.toFixed(4)}`)

    console.log('\n이번 달:')
    console.log(`  호출: ${summary.perplexity.calls.monthly}회`)
    console.log(`  입력 토큰: ${summary.perplexity.tokens.monthly.input.toLocaleString()}`)
    console.log(`  출력 토큰: ${summary.perplexity.tokens.monthly.output.toLocaleString()}`)
    console.log(`  전체 토큰: ${summary.perplexity.tokens.monthly.total.toLocaleString()}`)
    console.log(`  비용: $${summary.perplexity.monthly.toFixed(4)}`)

    console.log('\n✓ 테스트 완료!')
}

main().catch(error => {
    console.error('테스트 실패:', error)
    process.exit(1)
})
