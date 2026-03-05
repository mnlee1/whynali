import { NextResponse } from 'next/server'
import { cleanupRateLimit } from '@/lib/safety'

/**
 * GET /api/cron/cleanup-rate-limit
 * 
 * Rate Limit 맵에서 만료된 항목 정리
 * Vercel Cron으로 10분마다 호출 권장
 * 
 * vercel.json 설정 예시 (매 10분마다 실행)
 */
export async function GET() {
    try {
        cleanupRateLimit()
        return NextResponse.json({ success: true, message: 'Rate limit cleanup completed' })
    } catch (error) {
        console.error('Rate limit cleanup failed:', error)
        return NextResponse.json(
            { error: 'Cleanup failed' },
            { status: 500 }
        )
    }
}
