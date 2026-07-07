/**
 * lib/shortform/fetch-platform-stats.ts
 *
 * 업로드된 숏폼 영상의 플랫폼별 성과 지표 수집
 * - YouTube: Data API v3 statistics + Analytics API v2 완시청률
 * - Instagram: Graph API v21.0 media insights
 *
 * averageViewPercentage 주의:
 *   YouTube Analytics API는 yt-analytics.readonly scope 필요.
 *   YOUTUBE_REFRESH_TOKEN에 해당 scope가 없으면 null로 저장됨 (다른 지표는 정상 수집).
 */

import { google } from 'googleapis'
import { getInstagramAccessToken } from './instagram-token'

export interface YoutubeStats {
    views: number
    likes: number
    comments: number
    averageViewPercentage: number | null  // null = Analytics scope 없거나 데이터 부족
    fetched_at: string
}

export interface InstagramStats {
    plays: number
    reach: number
    likes: number
    comments: number
    shares: number
    saved: number
    avgWatchTimeMs: number | null  // null = 데이터 없음 (신규 영상 등)
    fetched_at: string
}

export interface PlatformStats {
    youtube?: YoutubeStats
    instagram?: InstagramStats
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

function getOAuth2Client() {
    const clientId     = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('YouTube 인증 정보 없음 (YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN)')
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'https://developers.google.com/oauthplayground',
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    return oauth2Client
}

export async function fetchYoutubeStats(videoId: string): Promise<YoutubeStats> {
    const auth = getOAuth2Client()

    // Data API: 조회수·좋아요·댓글
    const youtube = google.youtube({ version: 'v3', auth })
    const res = await youtube.videos.list({ part: ['statistics'], id: [videoId] })
    const stats = res.data.items?.[0]?.statistics ?? {}

    // Analytics API: 완시청률 (scope 없으면 null 유지)
    let averageViewPercentage: number | null = null
    try {
        const analytics = google.youtubeAnalytics({ version: 'v2', auth })
        const today = new Date().toISOString().split('T')[0]
        const aRes = await analytics.reports.query({
            ids: 'channel==MINE',
            startDate: '2020-01-01',
            endDate: today,
            metrics: 'averageViewPercentage',
            filters: `video==${videoId}`,
            dimensions: 'video',
        })
        const row = aRes.data.rows?.[0]
        if (row) {
            // row = [videoId, averageViewPercentage]
            averageViewPercentage = Math.round(Number(row[1]) * 10) / 10
        }
    } catch {
        // yt-analytics.readonly scope 미부여 또는 데이터 없음 → null 유지
    }

    return {
        views:    Number(stats.viewCount    ?? 0),
        likes:    Number(stats.likeCount    ?? 0),
        comments: Number(stats.commentCount ?? 0),
        averageViewPercentage,
        fetched_at: new Date().toISOString(),
    }
}

// ─── Instagram ───────────────────────────────────────────────────────────────

const GRAPH_API = 'https://graph.instagram.com/v21.0'

const IG_METRICS = 'plays,reach,likes,comments,shares,saved,ig_reels_avg_watch_time'

export async function fetchInstagramStats(mediaId: string): Promise<InstagramStats> {
    const accessToken = await getInstagramAccessToken()

    const url = `${GRAPH_API}/${mediaId}/insights?metric=${IG_METRICS}&period=lifetime&access_token=${accessToken}`
    const res = await fetch(url)
    const json = await res.json()

    if (!res.ok || json.error) {
        const msg = json.error?.message ?? `HTTP ${res.status}`
        throw new Error(`Instagram insights 조회 실패: ${msg}`)
    }

    const data: { name: string; values: { value: number }[] }[] = json.data ?? []
    const pick = (name: string) => data.find(d => d.name === name)?.values?.[0]?.value ?? 0

    const rawAvgWatch = data.find(d => d.name === 'ig_reels_avg_watch_time')?.values?.[0]?.value
    return {
        plays:         pick('plays'),
        reach:         pick('reach'),
        likes:         pick('likes'),
        comments:      pick('comments'),
        shares:        pick('shares'),
        saved:         pick('saved'),
        avgWatchTimeMs: rawAvgWatch != null ? rawAvgWatch : null,
        fetched_at:    new Date().toISOString(),
    }
}
