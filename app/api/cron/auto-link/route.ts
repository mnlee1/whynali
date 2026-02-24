/**
 * app/api/cron/auto-link/route.ts
 * 
 * [자동 연결 Cron]
 * 
 * 수집된 뉴스·커뮤니티 데이터를 이슈와 자동으로 연결합니다.
 * Vercel Cron으로 5분마다 실행됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { linkAllNewsToIssues } from '@/lib/linker/issue-news-linker'
import { linkAllCommunityToIssues } from '@/lib/linker/issue-community-linker'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()

        const [newsResults, communityResults] = await Promise.all([
            linkAllNewsToIssues(),
            linkAllCommunityToIssues(),
        ])

        const totalNewsLinked = newsResults.reduce((sum, r) => sum + r.linkedCount, 0)
        const totalNewsUnlinked = newsResults.reduce((sum, r) => sum + r.unlinkedCount, 0)
        const totalCommunityLinked = communityResults.reduce((sum, r) => sum + r.linkedCount, 0)
        const totalCommunityUnlinked = communityResults.reduce((sum, r) => sum + r.unlinkedCount, 0)

        const elapsed = Date.now() - startTime

        return NextResponse.json({
            success: true,
            news: {
                issuesProcessed: newsResults.length,
                totalLinked: totalNewsLinked,
                totalUnlinked: totalNewsUnlinked,
                details: newsResults,
            },
            community: {
                issuesProcessed: communityResults.length,
                totalLinked: totalCommunityLinked,
                totalUnlinked: totalCommunityUnlinked,
                details: communityResults,
            },
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('자동 연결 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'AUTO_LINK_ERROR',
                message: '자동 연결 실패',
            },
            { status: 500 }
        )
    }
}
