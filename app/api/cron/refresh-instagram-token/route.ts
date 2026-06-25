/**
 * app/api/cron/refresh-instagram-token/route.ts
 *
 * [Cron - 매월 1일 KST 오전 3시 실행]
 *
 * Instagram Long-lived 토큰을 강제 갱신.
 * 토큰 유효기간 60일 → 30일 주기로 갱신해 만료 위험 제거.
 */

import { NextRequest, NextResponse } from 'next/server'
import { forceRefreshInstagramToken } from '@/lib/shortform/instagram-token'

export const dynamic = 'force-dynamic'

function verifyCronRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return false
    return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
    if (!verifyCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const newToken = await forceRefreshInstagramToken()
        console.log('[Cron] Instagram 토큰 갱신 완료')
        return NextResponse.json({
            success: true,
            message: 'Instagram 토큰 갱신 완료',
            tokenPreview: `${newToken.slice(0, 10)}...`,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류'
        console.error('[Cron] Instagram 토큰 갱신 실패:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
