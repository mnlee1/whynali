/**
 * lib/shortform/youtube-upload.ts
 * 
 * YouTube Shorts 업로드 서비스 (YouTube Data API v3)
 * 
 * OAuth 2.0 인증을 사용하여 YouTube에 동영상을 업로드합니다.
 * Shorts로 인식되려면 #Shorts 해시태그와 세로 영상(9:16) 필요합니다.
 */

import { google } from 'googleapis'
import { Readable } from 'stream'

export interface YoutubeUploadOptions {
    title: string
    description: string
    tags?: string[]
    categoryId?: string
}

/**
 * YouTube OAuth 클라이언트 생성
 */
function getYoutubeClient() {
    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('YouTube 인증 정보가 설정되지 않았습니다 (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)')
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'https://developers.google.com/oauthplayground'
    )

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    })

    return google.youtube({ version: 'v3', auth: oauth2Client })
}

/**
 * YouTube Shorts 업로드
 * 
 * @param videoBuffer - 동영상 파일 버퍼
 * @param options - 업로드 옵션 (제목, 설명, 태그)
 * @returns YouTube 동영상 ID
 */
export async function uploadToYouTube(
    videoBuffer: Buffer,
    options: YoutubeUploadOptions
): Promise<string> {
    const youtube = getYoutubeClient()

    const { title, description, tags = [], categoryId = '22' } = options

    // Shorts 해시태그 자동 추가
    const fullDescription = `${description}\n\n#Shorts`
    const fullTags = ['Shorts', '왜난리', ...tags]

    const videoStream = Readable.from(videoBuffer)

    const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
            snippet: {
                title: title.slice(0, 100), // YouTube 제목 최대 100자
                description: fullDescription.slice(0, 5000), // 설명 최대 5000자
                tags: fullTags.slice(0, 500), // 태그 최대 500개
                categoryId, // 22 = People & Blogs
            },
            status: {
                privacyStatus: 'public', // public, unlisted, private
                selfDeclaredMadeForKids: false,
            },
        },
        media: {
            body: videoStream,
        },
    })

    const videoId = response.data.id
    if (!videoId) {
        throw new Error('YouTube 업로드 실패: 동영상 ID를 받지 못했습니다')
    }

    return videoId
}

/**
 * YouTube 동영상 URL 생성
 */
export function getYoutubeUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * YouTube Shorts URL 생성
 */
export function getYoutubeShortsUrl(videoId: string): string {
    return `https://www.youtube.com/shorts/${videoId}`
}
