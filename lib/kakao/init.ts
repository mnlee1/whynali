/**
 * lib/kakao/init.ts
 *
 * Kakao JavaScript SDK 초기화
 */

let isInitialized = false

export function initKakao() {
    if (typeof window === 'undefined') return false
    if (isInitialized) return true
    if (!window.Kakao) return false

    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY

    if (!kakaoKey) {
        console.warn('NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다')
        return false
    }

    try {
        if (!window.Kakao.isInitialized()) {
            window.Kakao.init(kakaoKey)
            isInitialized = true
        }
        return true
    } catch (error) {
        console.error('Kakao SDK 초기화 실패:', error)
        return false
    }
}

export function isKakaoReady() {
    if (typeof window === 'undefined') return false
    return window.Kakao && window.Kakao.isInitialized()
}
