import { NextRequest, NextResponse } from 'next/server'
import { collectAllCommunity } from '@/lib/collectors/community'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
