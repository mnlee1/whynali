/**
 * lib/lastLoginProvider.ts
 *
 * 로그인 화면에서 마지막으로 시도한 provider를 기억해 "최근 로그인" 뱃지를 표시하기 위한 유틸.
 * 실제 로그인 성공 여부와 무관하게 버튼 클릭 시점에 기록한다(성공 여부 추적은 범위 밖).
 */

export type LoginProvider = 'kakao' | 'naver' | 'google'

const STORAGE_KEY = 'whynali:lastLoginProvider'

export function getLastLoginProvider(): LoginProvider | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY)
        return value === 'kakao' || value === 'naver' || value === 'google' ? value : null
    } catch {
        return null
    }
}

export function setLastLoginProvider(provider: LoginProvider) {
    try {
        localStorage.setItem(STORAGE_KEY, provider)
    } catch {
        // localStorage 접근 불가 환경(프라이빗 모드 등)에서는 건너뛴다
    }
}
