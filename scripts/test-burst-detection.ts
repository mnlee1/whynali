/**
 * scripts/test-burst-detection.ts
 *
 * 급증 감지 시스템 테스트 스크립트
 *
 * 사용법:
 * npx tsx scripts/test-burst-detection.ts
 */

import { calculateBurstMetrics, detectBurst, getBurstLevel } from '../lib/candidate/burst-detector'

interface TestItem {
    id: string
    title: string
    created_at: string
    type: 'news' | 'community'
}

function createTestItems(count: number, minutesAgo: number): TestItem[] {
    const now = Date.now()
    const items: TestItem[] = []
    
    for (let i = 0; i < count; i++) {
        items.push({
            id: `test-${i}`,
            title: `테스트 뉴스 ${i}`,
            created_at: new Date(now - minutesAgo * 60 * 1000).toISOString(),
            type: 'news',
        })
    }
    
    return items
}

console.log('========================================')
console.log('급증 감지 시스템 테스트')
console.log('========================================\n')

// 테스트 1: 5분 급증 (8건)
console.log('테스트 1: 5분 급증 (8건)')
const test1Items = createTestItems(8, 3)
const test1Metrics = calculateBurstMetrics(test1Items)
const test1Burst = detectBurst(test1Items)
const test1Level = getBurstLevel(test1Items)

console.log('  결과:')
console.log(`    - 5분: ${test1Metrics.last5min}건`)
console.log(`    - 가속도: ${(test1Metrics.accelerationRatio * 100).toFixed(0)}%`)
console.log(`    - 급증 감지: ${test1Burst ? '✅ YES' : '❌ NO'}`)
console.log(`    - 급증 레벨: ${test1Level}`)
console.log(`    - 기대: 급증 감지 = true, 레벨 = 2 이상\n`)

// 테스트 2: 가속 패턴 (5분 3건, 15분 5건)
console.log('테스트 2: 가속 패턴')
const test2Items = [
    ...createTestItems(3, 3),  // 5분 전 3건
    ...createTestItems(2, 12), // 15분 전 2건
]
const test2Metrics = calculateBurstMetrics(test2Items)
const test2Burst = detectBurst(test2Items)
const test2Level = getBurstLevel(test2Items)

console.log('  결과:')
console.log(`    - 5분: ${test2Metrics.last5min}건`)
console.log(`    - 15분: ${test2Metrics.last15min}건`)
console.log(`    - 가속도: ${(test2Metrics.accelerationRatio * 100).toFixed(0)}%`)
console.log(`    - 급증 감지: ${test2Burst ? '✅ YES' : '❌ NO'}`)
console.log(`    - 급증 레벨: ${test2Level}`)
console.log(`    - 기대: 급증 감지 = true (가속도 60% > 50%)\n`)

// 테스트 3: 일반 누적 (30분간 5건)
console.log('테스트 3: 일반 누적 (30분간 5건)')
const test3Items = [
    ...createTestItems(1, 5),
    ...createTestItems(1, 10),
    ...createTestItems(1, 15),
    ...createTestItems(1, 20),
    ...createTestItems(1, 25),
]
const test3Metrics = calculateBurstMetrics(test3Items)
const test3Burst = detectBurst(test3Items)
const test3Level = getBurstLevel(test3Items)

console.log('  결과:')
console.log(`    - 5분: ${test3Metrics.last5min}건`)
console.log(`    - 15분: ${test3Metrics.last15min}건`)
console.log(`    - 30분: ${test3Metrics.last30min}건`)
console.log(`    - 가속도: ${(test3Metrics.accelerationRatio * 100).toFixed(0)}%`)
console.log(`    - 급증 감지: ${test3Burst ? '✅ YES' : '❌ NO'}`)
console.log(`    - 급증 레벨: ${test3Level}`)
console.log(`    - 기대: 급증 감지 = false (균등 분포)\n`)

// 테스트 4: 초강력 급증 (5분 12건)
console.log('테스트 4: 초강력 급증 (5분 12건)')
const test4Items = createTestItems(12, 2)
const test4Metrics = calculateBurstMetrics(test4Items)
const test4Burst = detectBurst(test4Items)
const test4Level = getBurstLevel(test4Items)

console.log('  결과:')
console.log(`    - 5분: ${test4Metrics.last5min}건`)
console.log(`    - 급증 감지: ${test4Burst ? '✅ YES' : '❌ NO'}`)
console.log(`    - 급증 레벨: ${test4Level}`)
console.log(`    - 기대: 급증 감지 = true, 레벨 = 3 (강함)\n`)

console.log('========================================')
console.log('테스트 완료')
console.log('========================================')
