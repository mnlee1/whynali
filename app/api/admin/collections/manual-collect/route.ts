/**
 * app/api/admin/collections/manual-collect/route.ts
 *
 * [관리자 - 수동 커뮤니티 수집 실행 API]
 *
 * 관리자 페이지에서 버튼 클릭으로 즉시 커뮤니티 수집을 실행합니다.
 * GitHub Actions 크론과 무관하게 작동하므로 브랜치 제약 없이 테스트 가능합니다.
 */

import { NextResponse } from 'next/server'
import { collectAllCommunity } from '@/lib/collectors/community'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
    try {
        console.log('[수동 수집] 커뮤니티 수집 시작...')
        const startTime = Date.now()
        
        const { theqoo, natePann } = await collectAllCommunity()
        
        const elapsed = Date.now() - startTime
        
        const result = {
            success: true,
            theqoo: {
                collected: theqoo.count,
                skipped: theqoo.skipped,
                warning: theqoo.warning ?? null,
            },
            natePann: {
                collected: natePann.count,
                skipped: natePann.skipped,
                warning: natePann.warning ?? null,
            },
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        }
        
        console.log('[수동 수집] 완료:', result)
        
        return NextResponse.json(result)
    } catch (error) {
        console.error('[수동 수집] 에러:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'COLLECTION_ERROR',
                message: '커뮤니티 수집 실패',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        )
    }
}
