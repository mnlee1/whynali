/**
 * lib/candidate/burst-detector.ts
 *
 * [급증 감지 시스템]
 *
 * 뉴스 수집 데이터의 급증 패턴을 감지하여 "지금 막 터지는" 이슈를 빠르게 캐치합니다.
 * 키워드 그루핑보다 먼저 실행되어 실시간성을 높입니다.
 *
 * 감지 조건:
 * 1. 절대 급증: 최근 5분간 N건 이상 (기본 5건)
 * 2. 가속 패턴: 15분 대비 5분 비율이 50% 이상
 *
 * 환경변수:
 * - NEWS_BURST_5MIN_THRESHOLD: 5분 임계값 (기본 5)
 * - NEWS_BURST_ACCELERATION_RATIO: 가속도 비율 (기본 0.5)
 */

interface RawItem {
    id: string
    title: string
    created_at: string
    type: 'news' | 'community'
}

interface BurstMetrics {
    last5min: number       // 최근 5분 건수
    last15min: number      // 최근 15분 건수
    last30min: number      // 최근 30분 건수
    total: number          // 전체 건수
    accelerationRatio: number  // 가속도 비율 (5분/15분)
}

const BURST_5MIN_THRESHOLD = parseInt(
    process.env.NEWS_BURST_5MIN_THRESHOLD ?? '5'
)
const BURST_ACCELERATION_RATIO = parseFloat(
    process.env.NEWS_BURST_ACCELERATION_RATIO ?? '0.5'
)

/**
 * calculateBurstMetrics - 시간대별 건수 계산
 */
export function calculateBurstMetrics(items: RawItem[]): BurstMetrics {
    const now = Date.now()
    
    const last5min = items.filter(i => 
        now - new Date(i.created_at).getTime() < 5 * 60 * 1000
    ).length
    
    const last15min = items.filter(i => 
        now - new Date(i.created_at).getTime() < 15 * 60 * 1000
    ).length
    
    const last30min = items.filter(i => 
        now - new Date(i.created_at).getTime() < 30 * 60 * 1000
    ).length
    
    const accelerationRatio = last15min > 0 ? last5min / last15min : 0
    
    return {
        last5min,
        last15min,
        last30min,
        total: items.length,
        accelerationRatio,
    }
}

/**
 * detectBurst - 급증 패턴 감지
 *
 * @param items - 그룹 내 수집 건 리스트
 * @returns 급증 여부
 */
export function detectBurst(items: RawItem[]): boolean {
    if (items.length < BURST_5MIN_THRESHOLD) return false
    
    const metrics = calculateBurstMetrics(items)
    
    // 조건 1: 절대 급증 (5분에 N건 이상)
    if (metrics.last5min >= BURST_5MIN_THRESHOLD) {
        console.log(
            `🔥 [뉴스 급증 감지] 5분간 ${metrics.last5min}건 ` +
            `(임계값: ${BURST_5MIN_THRESHOLD})`
        )
        return true
    }
    
    // 조건 2: 가속 패턴 (15분 대비 5분 비율이 50% 이상)
    if (metrics.accelerationRatio >= BURST_ACCELERATION_RATIO) {
        console.log(
            `🔥 [뉴스 가속 감지] 15분 ${metrics.last15min}건 → 5분 ${metrics.last5min}건 ` +
            `(비율: ${(metrics.accelerationRatio * 100).toFixed(0)}%, 임계값: ${BURST_ACCELERATION_RATIO * 100}%)`
        )
        return true
    }
    
    return false
}

/**
 * getBurstLevel - 급증 강도 레벨 판단
 *
 * @param items - 그룹 내 수집 건 리스트
 * @returns 급증 레벨 (0: 없음, 1: 약함, 2: 보통, 3: 강함)
 */
export function getBurstLevel(items: RawItem[]): 0 | 1 | 2 | 3 {
    const metrics = calculateBurstMetrics(items)
    
    // 5분간 10건 이상 → 강함
    if (metrics.last5min >= 10) return 3
    
    // 5분간 7건 이상 → 보통
    if (metrics.last5min >= 7) return 2
    
    // 5분간 5건 이상 OR 가속도 0.5 이상 → 약함
    if (metrics.last5min >= BURST_5MIN_THRESHOLD || 
        metrics.accelerationRatio >= BURST_ACCELERATION_RATIO) {
        return 1
    }
    
    return 0
}

/**
 * formatBurstReport - 급증 리포트 포맷팅 (로그용)
 */
export function formatBurstReport(
    title: string,
    items: RawItem[],
    burstLevel: number
): string {
    const metrics = calculateBurstMetrics(items)
    
    const emoji = ['⚪', '🟡', '🟠', '🔴'][burstLevel]
    
    return [
        `${emoji} 급증 리포트: "${title.substring(0, 40)}..."`,
        `  • 5분: ${metrics.last5min}건`,
        `  • 15분: ${metrics.last15min}건`,
        `  • 30분: ${metrics.last30min}건`,
        `  • 가속도: ${(metrics.accelerationRatio * 100).toFixed(0)}%`,
        `  • 레벨: ${['없음', '약함', '보통', '강함'][burstLevel]}`,
    ].join('\n')
}
