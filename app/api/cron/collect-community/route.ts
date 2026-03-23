import { NextRequest, NextResponse } from 'next/server'
import { collectAllCommunity } from '@/lib/collectors/community'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const { theqoo, natePann, clien, bobaedream, ruliweb, ppomppu } = await collectAllCommunity()

        return NextResponse.json({
            success: true,
            theqoo: { collected: theqoo.count, skipped: theqoo.skipped, warning: theqoo.warning ?? null },
            natePann: { collected: natePann.count, skipped: natePann.skipped, warning: natePann.warning ?? null },
            clien: { collected: clien.count, skipped: clien.skipped, warning: clien.warning ?? null },
            bobaedream: { collected: bobaedream.count, skipped: bobaedream.skipped, warning: bobaedream.warning ?? null },
            ruliweb: { collected: ruliweb.count, skipped: ruliweb.skipped, warning: ruliweb.warning ?? null },
            ppomppu: { collected: ppomppu.count, skipped: ppomppu.skipped, warning: ppomppu.warning ?? null },
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
