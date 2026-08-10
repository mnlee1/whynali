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

// KPI 리포트 "홍보 채널 현황"용 — 영상 하나가 아니라 채널 전체 누적 구독자·조회수
export interface YoutubeChannelStats {
    subscribers: number
    totalViews: number  // 채널 개설 이후 전체 누적 (기간별 API가 없어서, 이전 스냅샷과 비교해 기간 발생분을 계산해야 함)
    fetched_at: string
}

// 채널 통계는 공개 정보라 OAuth(소유권 인증) 없이 API 키 + 채널 핸들만으로 조회 가능
const YOUTUBE_CHANNEL_HANDLE = '왜난리'

export async function fetchYoutubeChannelStats(): Promise<YoutubeChannelStats> {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) throw new Error('YOUTUBE_API_KEY 없음')

    const youtube = google.youtube({ version: 'v3', auth: apiKey })
    const res = await youtube.channels.list({ part: ['statistics'], forHandle: YOUTUBE_CHANNEL_HANDLE })
    const stats = res.data.items?.[0]?.statistics ?? {}

    return {
        subscribers: Number(stats.subscriberCount ?? 0),
        totalViews:  Number(stats.viewCount ?? 0),
        fetched_at:  new Date().toISOString(),
    }
}

// KPI 리포트용 — 채널 전체의 기간별 좋아요·댓글 수.
// yt-analytics.readonly scope가 있어야 함 (없으면 null 반환, 화면에서 수동 입력으로 폴백).
// API 키로는 안 되고 OAuth(채널 소유자 인증)가 필요해서, 업로드용 refresh token을 그대로 씀.
export interface YoutubeEngagementStats {
    periodLikes: number | null
    periodComments: number | null
}

export async function fetchYoutubeEngagementStats(sinceIso: string, untilIso: string): Promise<YoutubeEngagementStats> {
    try {
        const auth = getOAuth2Client()
        const analytics = google.youtubeAnalytics({ version: 'v2', auth })
        const res = await analytics.reports.query({
            ids: 'channel==MINE',
            startDate: sinceIso.slice(0, 10),
            endDate: untilIso.slice(0, 10),
            metrics: 'likes,comments',
        })
        const row = res.data.rows?.[0]
        if (!row) return { periodLikes: null, periodComments: null }
        // row = [likes, comments] (metrics 순서대로)
        return { periodLikes: Number(row[0]) ?? null, periodComments: Number(row[1]) ?? null }
    } catch {
        // yt-analytics.readonly scope 미부여 등 → null 반환, 화면에서 수동 입력으로 폴백
        return { periodLikes: null, periodComments: null }
    }
}

// ─── Instagram ───────────────────────────────────────────────────────────────

const GRAPH_API = 'https://graph.instagram.com/v21.0'

const IG_METRICS = 'plays,reach,likes,comments,shares,saved,ig_reels_avg_watch_time'

export async function fetchInstagramStats(mediaId: string): Promise<InstagramStats> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    if (!accessToken) throw new Error('INSTAGRAM_ACCESS_TOKEN 없음')

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

// KPI 리포트 "홍보 채널 현황"용 — 계정 전체 팔로워 수 + 지정 기간 조회수·좋아요·댓글
// (인스타는 인사이트 API가 기간(since~until)을 직접 받아서, 유튜브 조회수처럼 누적값 비교 계산이 필요 없음)
export interface InstagramAccountStats {
    followers: number
    periodViews: number | null     // null = 조회 실패(권한 부족 등) → 화면에서 수동 입력으로 폴백
    periodLikes: number | null
    periodComments: number | null
    fetched_at: string
}

export async function fetchInstagramAccountStats(sinceIso: string, untilIso: string): Promise<InstagramAccountStats> {
    const accessToken = await getInstagramAccessToken()
    const userId = process.env.INSTAGRAM_USER_ID
    if (!userId) throw new Error('INSTAGRAM_USER_ID 없음')

    const since = Math.floor(new Date(sinceIso).getTime() / 1000)
    const until = Math.floor(new Date(untilIso).getTime() / 1000)

    // 팔로워 수 / 기간별 조회수·좋아요·댓글은 서로 무관한 별개 요청이라 동시에 호출한다
    const [profileRes, insightsResult] = await Promise.all([
        fetch(`${GRAPH_API}/${userId}?fields=followers_count&access_token=${accessToken}`),
        fetch(`${GRAPH_API}/${userId}/insights?metric=views,likes,comments&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${accessToken}`)
            .then(async res => ({ ok: res.ok, json: await res.json() }))
            .catch(() => null),  // 조회 실패 시 팔로워 수만 반영하고 나머지는 수동 입력으로 남김
    ])

    const profileJson = await profileRes.json()
    if (!profileRes.ok || profileJson.error) {
        throw new Error(`Instagram 계정 정보 조회 실패: ${profileJson.error?.message ?? `HTTP ${profileRes.status}`}`)
    }

    const insightsOk = insightsResult?.ok && !insightsResult.json.error
    const pickMetric = (name: string): number | null => {
        if (!insightsOk) return null
        const row = insightsResult!.json.data?.find((d: { name: string }) => d.name === name)
        return row?.total_value?.value ?? null
    }

    return {
        followers: Number(profileJson.followers_count ?? 0),
        periodViews: pickMetric('views'),
        periodLikes: pickMetric('likes'),
        periodComments: pickMetric('comments'),
        fetched_at: new Date().toISOString(),
    }
}
