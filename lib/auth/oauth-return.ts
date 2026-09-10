/**
 * lib/auth/oauth-return.ts
 *
 * naver/kakao/google OAuth 시작 라우트와 콜백 라우트가 공유하는
 * "에러 발생 시 어디로 되돌아갈지" 판단 로직.
 *
 * 로그인은 헤더의 공통 오버레이 모달(로그인 페이지가 아닌 현재 페이지 위에 뜸)에서
 * 시작되는 경우가 대부분이라, 에러도 /login 풀페이지로 보내는 대신 원래 있던 페이지로
 * 되돌려 모달 안에서 보여준다. Referer가 없거나(예: /login 풀페이지에서 직접 시도) 다른
 * origin이면 /login으로 폴백한다.
 */

import type { NextRequest } from 'next/server'

export function getReturnTo(request: NextRequest, origin: string): string {
    const referer = request.headers.get('referer')
    if (referer) {
        try {
            const refUrl = new URL(referer)
            if (refUrl.origin === origin) return `${refUrl.pathname}${refUrl.search}`
        } catch {
            // 잘못된 형식의 referer는 무시하고 기본값 사용
        }
    }
    return '/login'
}

// returnTo가 /login이면 기존처럼 그 페이지 안의 에러 배너로, 그 외 페이지면
// LoginErrorListener가 감지해 로그인 모달을 다시 열도록 쿼리를 실어 보낸다.
export function buildOAuthErrorRedirect(origin: string, returnTo: string, next: string, message: string): URL {
    const url = new URL(returnTo, origin)
    if (returnTo.startsWith('/login')) {
        url.searchParams.set('error', message)
    } else {
        url.searchParams.set('login_error', message)
        url.searchParams.set('next', next)
    }
    return url
}
