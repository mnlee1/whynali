/**
 * lib/cron-auth.ts
 *
 * Cron 요청 인증 공통 유틸
 *
 * CRON_SECRET 누락 시:
 *   - 개발 환경(NODE_ENV !== 'production'): 경고 로그 후 통과
 *   - 운영 환경(production): 즉시 차단 + 오류 로그
 *
 * 사용 예시:
 *   const authError = verifyCronRequest(request)
 *   if (authError) return authError
 */

import { NextRequest, NextResponse } from 'next/server'

export function verifyCronRequest(request: NextRequest): NextResponse | null {
    const cronSecret = process.env.CRON_SECRET
    const isProduction = process.env.NODE_ENV === 'production'

    if (!cronSecret) {
        if (isProduction) {
            console.error('[cron] CRON_SECRET 미설정. 운영 환경에서 Cron 요청을 차단합니다.')
            return NextResponse.json(
                { error: 'SERVER_CONFIG_ERROR', message: 'Cron 인증 키가 설정되지 않았습니다.' },
                { status: 500 }
            )
        }
        console.warn('[cron] CRON_SECRET 미설정. 개발 환경이므로 인증을 건너뜁니다.')
        return null
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return null
}
