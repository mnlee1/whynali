/**
 * lib/shortform/tiktok-upload.ts
 *
 * TikTok Content Posting API를 사용한 동영상 업로드 서비스
 *
 * video.upload (초안) 방식 사용:
 * - Sandbox 환경 및 Production 모두 지원
 * - 업로드된 영상은 TikTok 앱 받은 편지함(Inbox)에 초안으로 저장됨
 * - 계정에서 직접 게시 필요
 *
 * 업로드 흐름:
 * 1. 초기화 (upload URL 받기)
 * 2. 동영상 파일 업로드
 */

export interface TikTokUploadOptions {
    title: string
    privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY'
    disableComment?: boolean
    disableDuet?: boolean
    disableStitch?: boolean
}

interface TikTokInitUploadResponse {
    data: {
        publish_id: string
        upload_url: string
    }
    error?: {
        code: string
        message: string
        log_id?: string
    }
}

/**
 * 업로드 초기화 API 호출 (내부 헬퍼)
 */
async function initTikTokUpload(
    accessToken: string,
    videoBuffer: Buffer,
    options: TikTokUploadOptions
): Promise<TikTokInitUploadResponse> {
    const {
        title,
        disableComment = false,
        disableDuet = true,
        disableStitch = true,
    } = options

    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            post_info: {
                title: title.slice(0, 150),
                disable_comment: disableComment,
                disable_duet: disableDuet,
                disable_stitch: disableStitch,
            },
            source_info: {
                source: 'FILE_UPLOAD',
                video_size: videoBuffer.length,
                chunk_size: videoBuffer.length,
                total_chunk_count: 1,
            },
        }),
    })

    const json = await response.json()

    // 디버그 로그 (서버 콘솔에서 확인 가능)
    if (!response.ok || json.error) {
        console.error('[TikTok Upload] Init 응답:', JSON.stringify(json))
    }

    // 401 = 토큰 만료 신호를 구분하기 위해 status를 함께 반환
    if (response.status === 401) {
        throw Object.assign(new Error('TOKEN_EXPIRED'), { code: 'TOKEN_EXPIRED' })
    }

    if (!response.ok) {
        const msg = json.error?.message || json.message || response.statusText || String(response.status)
        throw new Error(`TikTok 업로드 초기화 실패: ${msg}`)
    }

    return json as TikTokInitUploadResponse
}

/**
 * TikTok inbox/video/init API로 초안 업로드
 * scope: video.upload 필요
 * access_token 만료 시 refresh_token으로 자동 갱신 후 재시도
 */
export async function uploadToTikTok(
    videoBuffer: Buffer,
    options: TikTokUploadOptions
): Promise<string> {
    const { getTikTokAccessToken, refreshTikTokAccessToken } = await import('./tiktok-token')

    // 1단계: 업로드 초기화 (토큰 만료 시 자동 갱신 후 1회 재시도)
    let accessToken = await getTikTokAccessToken()
    let initData: TikTokInitUploadResponse

    try {
        initData = await initTikTokUpload(accessToken, videoBuffer, options)
    } catch (err: any) {
        if (err.code === 'TOKEN_EXPIRED') {
            console.log('[TikTok Upload] access_token 만료 → refresh_token으로 갱신 후 재시도')
            accessToken = await refreshTikTokAccessToken()
            initData = await initTikTokUpload(accessToken, videoBuffer, options)
        } else {
            throw err
        }
    }

    // TikTok은 성공 시에도 error 필드를 보내며 code: "ok" 로 성공을 표시함
    if (initData.error && initData.error.code !== 'ok') {
        const msg = initData.error.message || initData.error.code
        throw new Error(`TikTok 업로드 초기화 실패: ${msg}`)
    }

    const { publish_id, upload_url } = initData.data

    // 2단계: 동영상 파일 업로드
    const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(videoBuffer.length),
            'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
        },
        body: new Uint8Array(videoBuffer),
    })

    const uploadBody = await uploadResponse.text().catch(() => '')
    console.log(`[TikTok Upload] PUT 응답 status=${uploadResponse.status} body=${uploadBody}`)

    if (!uploadResponse.ok) {
        throw new Error(`TikTok 파일 업로드 실패: ${uploadResponse.status} ${uploadBody}`)
    }

    return publish_id
}

/**
 * TikTok 프로필 URL 생성
 */
export function getTikTokProfileUrl(username: string): string {
    return `https://www.tiktok.com/@${username}`
}
