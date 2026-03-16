/**
 * lib/ai/rate-limit-priority.ts
 * 
 * Groq API Rate Limit 우선순위 관리
 * 
 * 트랙 A 같은 중요한 작업에 우선순위를 부여하여
 * Rate Limit이 소진되었을 때 낮은 우선순위 작업을 건너뛰게 함
 */

interface RateLimitRequest {
    priority: 'critical' | 'high' | 'normal' | 'low'
    taskName: string
}

const RATE_LIMIT_STATE = {
    recentFailures: 0,
    lastFailureTime: 0,
    isThrottled: false,
}

const PRIORITY_THRESHOLDS = {
    critical: 0,   // 항상 실행 (트랙 A)
    high: 2,       // 최근 2회 실패 시 건너뛰기
    normal: 1,     // 최근 1회 실패 시 건너뛰기
    low: 0,        // Rate Limit 감지 즉시 건너뛰기
}

/**
 * Rate Limit 상태 체크
 */
export function shouldSkipDueToRateLimit(request: RateLimitRequest): boolean {
    const threshold = PRIORITY_THRESHOLDS[request.priority]
    
    // Critical은 항상 실행
    if (request.priority === 'critical') {
        return false
    }
    
    // 최근 실패 횟수가 임계값 이상이면 건너뛰기
    if (RATE_LIMIT_STATE.recentFailures > threshold) {
        console.log(`[Rate Limit] ${request.taskName} 건너뛰기 (우선순위: ${request.priority}, 실패: ${RATE_LIMIT_STATE.recentFailures}회)`)
        return true
    }
    
    return false
}

/**
 * Rate Limit 실패 기록
 */
export function recordRateLimitFailure() {
    RATE_LIMIT_STATE.recentFailures++
    RATE_LIMIT_STATE.lastFailureTime = Date.now()
    RATE_LIMIT_STATE.isThrottled = true
    
    // 5분 후 자동 리셋
    setTimeout(() => {
        RATE_LIMIT_STATE.recentFailures = Math.max(0, RATE_LIMIT_STATE.recentFailures - 1)
        if (RATE_LIMIT_STATE.recentFailures === 0) {
            RATE_LIMIT_STATE.isThrottled = false
        }
    }, 5 * 60 * 1000)
}

/**
 * Rate Limit 성공 기록 (점진적 복구)
 */
export function recordRateLimitSuccess() {
    if (RATE_LIMIT_STATE.recentFailures > 0) {
        RATE_LIMIT_STATE.recentFailures--
    }
    if (RATE_LIMIT_STATE.recentFailures === 0) {
        RATE_LIMIT_STATE.isThrottled = false
    }
}

/**
 * 현재 Rate Limit 상태
 */
export function getRateLimitStatus() {
    return {
        ...RATE_LIMIT_STATE,
        timeSinceLastFailure: Date.now() - RATE_LIMIT_STATE.lastFailureTime,
    }
}
