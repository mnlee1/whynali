/**
 * global.d.ts
 * 
 * 전역 타입 정의
 * - Google Analytics gtag 함수 타입 정의
 * - Kakao SDK 타입 정의
 */

declare global {
    interface Window {
        gtag?: (
            command: 'config' | 'event' | 'js' | 'set',
            targetId: string | Date,
            config?: Record<string, any>
        ) => void
        Kakao?: any
    }
}

export {}
