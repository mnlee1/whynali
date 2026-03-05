/**
 * lib/cache/candidates-cache.ts
 *
 * [이슈 후보 조회 결과 캐싱]
 *
 * evaluateCandidates() 함수는 매우 무거운 작업이므로
 * 결과를 메모리에 캐싱하여 반복 호출을 방지합니다.
 *
 * 캐시 유효 시간: 3분 (환경변수로 조정 가능)
 */

import type { CandidateResult } from '@/lib/candidate/issue-candidate'

interface CacheEntry {
    data: CandidateResult
    timestamp: number
}

let cache: CacheEntry | null = null

const CACHE_TTL_MS = parseInt(process.env.CANDIDATES_CACHE_TTL_MINUTES ?? '3') * 60 * 1000

export function getCachedCandidates(): CandidateResult | null {
    if (!cache) return null

    const now = Date.now()
    const age = now - cache.timestamp

    if (age > CACHE_TTL_MS) {
        console.log(`[후보 캐시] 만료됨 (${Math.round(age / 1000)}초 경과)`)
        cache = null
        return null
    }

    console.log(`[후보 캐시] 히트 (${Math.round(age / 1000)}초 전 데이터)`)
    return cache.data
}

export function setCachedCandidates(data: CandidateResult): void {
    cache = {
        data,
        timestamp: Date.now(),
    }
    console.log(`[후보 캐시] 저장됨 (알람 ${data.alerts.length}건, 생성 ${data.created}건)`)
}

export function clearCandidatesCache(): void {
    cache = null
    console.log('[후보 캐시] 초기화됨')
}
