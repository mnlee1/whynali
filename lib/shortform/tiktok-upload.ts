/**
 * lib/shortform/tiktok-upload.ts
 * 
 * TikTok Content Posting API를 사용한 동영상 업로드 서비스
 * 
 * TikTok API는 OAuth 2.0 인증을 사용하며,
 * 동영상 업로드는 2단계로 진행됩니다:
 * 1. 초기화 (upload URL 받기)
 * 2. 동영상 파일 업로드
 * 3. 게시 (publish)
 */

export interface TikTokUploadOptions {
    title: string
    description?: string
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
}

interface TikTokPublishResponse {
    data: {
        publish_id: string
    }
    error?: {
        code: string
        message: string
    }
}

/**
 * TikTok Content Posting API를 사용하여 동영상 업로드
 * 
 * @param videoBuffer - 동영상 파일 버퍼
 * @param options - 업로드 옵션
 * @returns TikTok 게시물 ID
 */
export async function uploadToTikTok(
    videoBuffer: Buffer,
    options: TikTokUploadOptions
): Promise<string> {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN

    if (!accessToken) {
        throw new Error('TikTok Access Token이 설정되지 않았습니다 (TIKTOK_ACCESS_TOKEN)')
    }

    const {
        title,
        description = '',
        privacyLevel = 'PUBLIC_TO_EVERYONE',
        disableComment = false,
        disableDuet = true,
        disableStitch = true,
    } = options

    try {
        // 1단계: 업로드 초기화
        const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                post_info: {
                    title: title.slice(0, 150), // TikTok 제목 최대 150자
                    description: description.slice(0, 2200), // 설명 최대 2200자
                    privacy_level: privacyLevel,
                    disable_comment: disableComment,
                    disable_duet: disableDuet,
                    disable_stitch: disableStitch,
                },
                source_info: {
                    source: 'FILE_UPLOAD',
                    video_size: videoBuffer.length,
                },
            }),
        })

        if (!initResponse.ok) {
            const error = await initResponse.json()
            throw new Error(`TikTok 업로드 초기화 실패: ${error.error?.message || initResponse.statusText}`)
        }

        const initData: TikTokInitUploadResponse = await initResponse.json()
        const { publish_id, upload_url } = initData.data

        // 2단계: 동영상 파일 업로드
        const uploadResponse = await fetch(upload_url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(videoBuffer.length),
            },
            body: videoBuffer,
        })

        if (!uploadResponse.ok) {
            throw new Error(`TikTok 파일 업로드 실패: ${uploadResponse.statusText}`)
        }

        // 3단계: 게시 완료
        const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                publish_id,
            }),
        })

        if (!publishResponse.ok) {
            const error = await publishResponse.json()
            throw new Error(`TikTok 게시 실패: ${error.error?.message || publishResponse.statusText}`)
        }

        const publishData: TikTokPublishResponse = await publishResponse.json()

        if (publishData.error) {
            throw new Error(`TikTok 게시 실패: ${publishData.error.message}`)
        }

        return publishData.data.publish_id
    } catch (error) {
        console.error('[tiktok-upload] 업로드 실패:', error)
        throw error
    }
}

/**
 * TikTok 게시물 URL 생성
 * 참고: TikTok API는 게시물 URL을 직접 제공하지 않으므로
 * 사용자 프로필에서 확인해야 합니다.
 */
export function getTikTokProfileUrl(username: string): string {
    return `https://www.tiktok.com/@${username}`
}
