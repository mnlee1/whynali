/**
 * app/api/cron/filter-candidates/route.ts
 *
 * [이슈 전처리 필터 Cron]
 *
 * 5분마다 실행되며 수집된 뉴스·커뮤니티 데이터를 2단계로 필터링한다.
 * 1단계: 조회수·댓글수 등 메타데이터 사전 필터 (API 비용 절감)
 * 2단계: Perplexity AI 점수화 + 5대 카테고리 자동 매핑
 * → 7점 이상인 건만 issue_candidates 테이블에 저장
 *
 * GitHub Actions에서 호출: .github/workflows/cron-filter-candidates.yml
 */

import { NextRequest, NextResponse } from 'next/server'
import { runPerplexityFilter } from '@/lib/ai/perplexity-filter'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const result = await runPerplexityFilter()
        const elapsed = Date.now() - startTime

        return NextResponse.json({
            success: true,
            stage1Passed: result.stage1Passed,
            aiQueried: result.aiQueried,
            saved: result.saved,
            errors: result.errors,
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('이슈 전처리 필터 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'FILTER_CANDIDATES_ERROR',
                message: '이슈 전처리 필터 실패',
            },
            { status: 500 }
        )
    }
}
