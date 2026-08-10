/**
 * app/api/admin/channel-promo-stats/fetch/route.ts
 *
 * 유튜브·인스타그램 채널 통계를 실시간으로 불러온다 (틱톡은 권한 부족으로 아직 미지원, 수동 입력 유지).
 * - 유튜브: 채널 전체 누적 구독자·조회수(API 키) + 지정 기간 좋아요·댓글(애널리틱스, OAuth)
 * - 인스타그램: 팔로워 수 + 지정 기간(since~until) 조회수·좋아요·댓글
 *
 * GET /api/admin/channel-promo-stats/fetch?since=2026-08-02T00:00:00.000Z&until=2026-08-09T00:00:00.000Z
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchYoutubeChannelStats, fetchYoutubeEngagementStats, fetchInstagramAccountStats } from '@/lib/shortform/fetch-platform-stats'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const since = searchParams.get('since')
    const until = searchParams.get('until')

    if (!since || !until) {
        return NextResponse.json({ error: 'since, until은 필수입니다' }, { status: 400 })
    }

    const [youtubeChannel, youtubeEngagement, instagram] = await Promise.allSettled([
        fetchYoutubeChannelStats(),
        fetchYoutubeEngagementStats(since, until),
        fetchInstagramAccountStats(since, until),
    ])

    const youtube = youtubeChannel.status === 'fulfilled'
        ? {
            ...youtubeChannel.value,
            periodLikes: youtubeEngagement.status === 'fulfilled' ? youtubeEngagement.value.periodLikes : null,
            periodComments: youtubeEngagement.status === 'fulfilled' ? youtubeEngagement.value.periodComments : null,
        }
        : null

    return NextResponse.json({
        success: true,
        youtube,
        youtubeError: youtubeChannel.status === 'rejected'
            ? (youtubeChannel.reason instanceof Error ? youtubeChannel.reason.message : String(youtubeChannel.reason))
            : null,
        instagram: instagram.status === 'fulfilled' ? instagram.value : null,
        instagramError: instagram.status === 'rejected'
            ? (instagram.reason instanceof Error ? instagram.reason.message : String(instagram.reason))
            : null,
    })
}
