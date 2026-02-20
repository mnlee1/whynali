/* Day 9 세이프티 함수 직접 테스트 */

const BANNED_WORDS = ['욕설1', '욕설2']
const LENGTH_LIMITS = { comment: 1000, discussion: 500, vote_option: 50 }

function sanitizeText(text) {
    return text.trim().replace(/<[^>]*>/g, '')
}

function validateContent(text, type) {
    const cleaned = sanitizeText(text)
    if (!cleaned) return { valid: false, reason: '내용을 입력해 주세요.' }
    if (cleaned.length > LENGTH_LIMITS[type]) {
        return { valid: false, reason: `최대 ${LENGTH_LIMITS[type]}자까지 입력 가능합니다.` }
    }
    const hasBannedWord = BANNED_WORDS.some((word) => cleaned.includes(word))
    if (hasBannedWord) {
        return { valid: false, reason: '사용할 수 없는 단어가 포함되어 있습니다.' }
    }
    return { valid: true }
}

const rateLimitMap = new Map()
const RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 }

function checkRateLimit(userId) {
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

function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
    if (!ok) {
        console.log(`       expected: ${JSON.stringify(expected)}`)
        console.log(`       actual:   ${JSON.stringify(actual)}`)
    }
}

console.log('\n=== [Day 9 AM] sanitizeText 검증 ===')
check('앞뒤 공백 제거', sanitizeText('  hello  '), 'hello')
check('HTML 태그 제거', sanitizeText('<script>alert(1)</script>test'), 'test')
check('XSS 방어', sanitizeText('<b>굵게</b> 텍스트'), ' 텍스트')

console.log('\n=== [Day 9 AM] validateContent - 댓글 ===')
check('정상 입력', validateContent('정상적인 댓글입니다.', 'comment'), { valid: true })
check('빈 입력', validateContent('   ', 'comment'), { valid: false, reason: '내용을 입력해 주세요.' })
check('금칙어(욕설1) 포함', validateContent('욕설1이 포함된 댓글', 'comment'), { valid: false, reason: '사용할 수 없는 단어가 포함되어 있습니다.' })
check('금칙어(욕설2) 포함', validateContent('이건 욕설2야', 'comment'), { valid: false, reason: '사용할 수 없는 단어가 포함되어 있습니다.' })
check(`1001자 초과`, validateContent('가'.repeat(1001), 'comment'), { valid: false, reason: '최대 1000자까지 입력 가능합니다.' })
check('1000자 정확히', validateContent('가'.repeat(1000), 'comment'), { valid: true })

console.log('\n=== [Day 9 AM] validateContent - 토론 주제 ===')
check('토론 정상 입력', validateContent('정상적인 토론 주제입니다.', 'discussion'), { valid: true })
check('토론 501자 초과', validateContent('가'.repeat(501), 'discussion'), { valid: false, reason: '최대 500자까지 입력 가능합니다.' })
check('토론 500자 정확히', validateContent('가'.repeat(500), 'discussion'), { valid: true })

console.log('\n=== [Day 9 PM] checkRateLimit 검증 ===')
const userId = 'test-user-001'
let passed = 0
for (let i = 1; i <= 10; i++) {
    const result = checkRateLimit(userId)
    if (result.allowed) passed++
}
check('처음 10회 허용', passed, 10)
const r11 = checkRateLimit(userId)
check('11번째 차단', r11, { allowed: false, reason: '잠시 후 다시 시도해 주세요. (1분에 최대 10회)' })

const userId2 = 'test-user-002'
check('다른 사용자는 독립적', checkRateLimit(userId2), { allowed: true })

console.log('\n=== 완료 ===')
