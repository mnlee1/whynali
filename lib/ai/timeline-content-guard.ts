/**
 * lib/ai/timeline-content-guard.ts
 *
 * 타임라인/브리핑 요약 생성 시 AI가 프롬프트의 "출력 금지 규칙"을 무시하고
 * 커뮤니티 출처 사이트명이나 "커뮤니티에서 화제가 되고 있다" 류의 반응을
 * 언급하는 경우를 코드 레벨에서 걸러낸다. (무료 모델은 negative instruction을
 * 안정적으로 지키지 못하므로 프롬프트 지시만으로는 부족)
 */

const BANNED_SITE_PATTERN = /더쿠|네이트판|클리앙|보배드림|뽐뿌/
const BANNED_REACTION_PATTERN = /(온라인|커뮤니티)[^.]{0,20}(화제|확산|공유|여론|토론|논쟁|반응|글)[^.]{0,20}(되고\s?있|진행되고\s?있|일고\s?있|이어지고\s?있|급증|뜨겁|떠돌)/

export function containsBannedCommunityMention(text: string): boolean {
    return BANNED_SITE_PATTERN.test(text) || BANNED_REACTION_PATTERN.test(text)
}

/** bullets 배열에서 금지 표현이 포함된 항목을 제거하고 로그를 남긴다 */
export function filterBannedBullets<T extends { text: string }>(
    bullets: T[],
    context: string,
): T[] {
    const filtered = bullets.filter(b => {
        const banned = containsBannedCommunityMention(b.text)
        if (banned) {
            console.warn(`  ⚠️ [금지 표현 차단] ${context}: "${b.text}"`)
        }
        return !banned
    })
    if (filtered.length < bullets.length) {
        console.log(`  ✓ [금지 표현 제거] ${context}: ${bullets.length}개 → ${filtered.length}개`)
    }
    return filtered
}
