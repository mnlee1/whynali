/**
 * 이메일 유효성 검사
 *
 * 커버 시나리오:
 * - @ 기호 존재 및 단일 여부
 * - 로컬 파트: 비어있지 않음, 64자 이하, ASCII 허용 문자, 점 규칙
 * - 도메인: 비어있지 않음, ASCII 허용 문자, 점 규칙
 * - TLD: 영문 2자 이상
 * - 전체 길이 254자 이하
 * - 비ASCII(한글 등) 차단
 *
 * @returns 오류 메시지 (유효하면 null)
 */
export function validateEmail(email: string): string | null {
    const trimmed = email.trim()

    if (!trimmed) return '이메일을 입력해주세요.'
    if (trimmed.length > 254) return '이메일 주소가 너무 깁니다.'

    const atCount = (trimmed.match(/@/g) ?? []).length
    if (atCount === 0) return '올바른 이메일 형식이 아닙니다. (@가 없습니다)'
    if (atCount > 1) return '올바른 이메일 형식이 아닙니다. (@가 중복됩니다)'

    const [local, domain] = trimmed.split('@')

    // 로컬 파트 검사
    if (!local || local.length > 64) return '올바른 이메일 형식이 아닙니다.'
    if (local.startsWith('.') || local.endsWith('.')) return '올바른 이메일 형식이 아닙니다.'
    if (local.includes('..')) return '올바른 이메일 형식이 아닙니다.'
    if (!/^[a-zA-Z0-9._%+\-]+$/.test(local)) return '올바른 이메일 형식이 아닙니다.'

    // 도메인 검사
    if (!domain || !domain.includes('.')) return '올바른 이메일 형식이 아닙니다.'
    if (domain.startsWith('.') || domain.endsWith('.')) return '올바른 이메일 형식이 아닙니다.'
    if (domain.startsWith('-') || domain.endsWith('-')) return '올바른 이메일 형식이 아닙니다.'
    if (domain.includes('..')) return '올바른 이메일 형식이 아닙니다.'
    if (!/^[a-zA-Z0-9.\-]+$/.test(domain)) return '올바른 이메일 형식이 아닙니다.'

    // TLD 검사 (영문 2자 이상)
    const tld = domain.split('.').pop()
    if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return '올바른 이메일 형식이 아닙니다.'

    return null
}
