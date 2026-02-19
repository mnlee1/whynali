/* 세이프티 공통 모듈: 입력 검증, 정제, Rate Limit */

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

/* ── 3. sanitize: 앞뒤 공백 제거 + 태그 제거 ── */
export function sanitizeText(text: string): string {
    return text.trim().replace(/<[^>]*>/g, '')
}

/* ── 4. validate: 길이·금칙어 검사 ── */
export function validateContent(
    text: string,
    type: ContentType
): { valid: boolean; reason?: string } {
    const cleaned = sanitizeText(text)

    if (!cleaned) {
        return { valid: false, reason: '내용을 입력해 주세요.' }
    }

    if (cleaned.length > LENGTH_LIMITS[type]) {
        return { valid: false, reason: `최대 ${LENGTH_LIMITS[type]}자까지 입력 가능합니다.` }
    }

    const hasBannedWord = BANNED_WORDS.some((word) => cleaned.includes(word))
    if (hasBannedWord) {
        return { valid: false, reason: '사용할 수 없는 단어가 포함되어 있습니다.' }
    }

    return { valid: true }
}

/* ── 5. Rate Limit: 메모리 기반 (서버리스 환경에서는 Redis 전환 권장) ── */
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
