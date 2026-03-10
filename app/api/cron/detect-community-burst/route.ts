/**
 * app/api/cron/detect-community-burst/route.ts
 *
 * [커뮤니티 급증 감지 Cron]
 *
 * 3분마다 실행되어 커뮤니티 게시글의 급증 패턴을 감지하고
 * 긴급 이슈를 생성합니다.
 *
 * 실행 주기: 3분
 * 역할: 뉴스보다 먼저 터지는 커뮤니티 반응 캐치
 */

import { NextRequest, NextResponse } from 'next/server'
import { detectCommunityBurst } from '@/lib/candidate/community-burst-detector'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    try {
        // Vercel Cron 인증 (CRON_SECRET이 설정되어 있을 때만)
        if (process.env.CRON_SECRET) {
            const authHeader = request.headers.get('authorization')
            if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
        }
        
        const startTime = Date.now()
        console.log('\n============================================')
        console.log('[Cron] 커뮤니티 급증 감지 시작')
        console.log('============================================\n')
        
        const createdCount = await detectCommunityBurst()
        
        const elapsed = Date.now() - startTime
        
        console.log('\n============================================')
        console.log('[Cron] 커뮤니티 급증 감지 완료')
        console.log(`  • 생성된 긴급 이슈: ${createdCount}개`)
        console.log(`  • 소요 시간: ${(elapsed / 1000).toFixed(1)}초`)
        console.log('============================================\n')
        
        return NextResponse.json({
            success: true,
            created: createdCount,
            elapsed_ms: elapsed,
        })
        
    } catch (error) {
        console.error('\n[Cron Error] 커뮤니티 급증 감지 실패:', error)
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        )
    }
}
