import { NextRequest, NextResponse } from 'next/server'
import { collectAllCommunity } from '@/lib/collectors/community'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const { theqoo, natePann } = await collectAllCommunity()

        return NextResponse.json({
            success: true,
            theqoo,
            natePann,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('커뮤니티 수집 Cron 에러:', error)
        return NextResponse.json(
            { error: 'COLLECTION_ERROR', message: '커뮤니티 수집 실패' },
            { status: 500 }
        )
    }
}
