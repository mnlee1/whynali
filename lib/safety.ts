/**
 * lib/safety.ts
 *
 * 세이프티 공통 모듈: 입력 검증, 정제, Rate Limit
 *
 * loadBannedWords: DB safety_rules에서 금칙어 목록을 로드한다.
 *   모든 쓰기 API(생성/수정/관리자 수정)에서 이 함수를 통해 동일한 금칙어 정책을 적용한다.
 * validateContent: 길이·금칙어 검사. extraBannedWords에 loadBannedWords 결과를 전달한다.
 * checkRateLimit: 메모리 기반 Rate Limit (서버리스 환경에서는 Redis 전환 권장 - TODO #5).
 */

/* ── 1. 금칙어 목록 (추후 DB 또는 별도 파일로 분리 가능) ── */
const BANNED_WORDS: string[] = [
    '욕설1', '욕설2',
]

/* ── 2. 입력 길이 제한 기준 ── */
const LENGTH_LIMITS = {
    comment: 1000,
    discussion: 500,
    vote_option: 50,
} as const

type ContentType = keyof typeof LENGTH_LIMITS

/* ── 3. DB 금칙어 로드 (공통) ── */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * loadBannedWords - DB safety_rules 테이블에서 금칙어 목록 로드
 *
 * 댓글 생성/수정, 토론 생성, 관리자 수정 등 모든 쓰기 API에서 동일하게 사용.
 * 실패 시 빈 배열로 폴백 — 하드코딩 금칙어(BANNED_WORDS)는 항상 적용됨.
 *
 * 예시:
 *   const bannedWords = await loadBannedWords(adminClient)
 *   const { valid, pendingReview, reason } = validateContent(content, 'comment', bannedWords)
 */
export async function loadBannedWords(adminClient: SupabaseClient): Promise<string[]> {
    const { data } = await adminClient
        .from('safety_rules')
        .select('value')
        .eq('kind', 'banned_word')
    return (data ?? []).map((r: { value: string }) => r.value)
}

/* ── 4. sanitize: 앞뒤 공백 제거 + 태그 제거 ── */
export function sanitizeText(text: string): string {
    return text.trim().replace(/<[^>]*>/g, '')
}

/* ── 5. validate: 길이·금칙어 검사 ──
   - valid: false + pendingReview 없음 → 즉시 거부 (400)
   - valid: false + pendingReview: true → 금칙어 포함, 검토 대기 저장 가능
   - valid: true → 정상 저장
   - extraBannedWords: DB safety_rules에서 조회한 추가 금칙어 목록 */
export function validateContent(
    text: string,
    type: ContentType,
    extraBannedWords: string[] = []
): { valid: boolean; pendingReview?: boolean; reason?: string } {
    const cleaned = sanitizeText(text)

    if (!cleaned) {
        return { valid: false, reason: '내용을 입력해 주세요.' }
    }

    if (cleaned.length > LENGTH_LIMITS[type]) {
        return { valid: false, reason: `최대 ${LENGTH_LIMITS[type]}자까지 입력 가능합니다.` }
    }

    const allBannedWords = [...BANNED_WORDS, ...extraBannedWords]
    const hasBannedWord = allBannedWords.some((word) => cleaned.includes(word))
    if (hasBannedWord) {
        return { valid: false, pendingReview: true, reason: '사용할 수 없는 단어가 포함되어 있습니다.' }
    }

    return { valid: true }
}

/* ── 6. Rate Limit: 메모리 기반 (서버리스 환경에서는 Redis 전환 권장) ── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT = {
    maxRequests: 10,
    windowMs: 60 * 1000,
} as const

export function checkRateLimit(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now()
    const record = rateLimitMap.get(userId)

    if (!record || now > record.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT.windowMs })
        return { allowed: true }
    }

    if (record.count >= RATE_LIMIT.maxRequests) {
        return { allowed: false, reason: '잠시 후 다시 시도해 주세요. (1분에 최대 10회)' }
    }

    record.count += 1
    return { allowed: true }
}
