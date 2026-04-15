/**
 * lib/shortform/instagram-upload.ts
 *
 * Instagram Graph API를 사용한 Reels 업로드 서비스
 *
 * 업로드 흐름:
 * 1. 미디어 컨테이너 생성 (Supabase Storage 공개 URL 전달)
 * 2. 처리 완료 대기 (폴링)
 * 3. 게시 (publish)
 *
 * 주의: Instagram API는 파일 직접 업로드 불가 → 공개 URL 필요
 * Supabase Storage 공개 URL을 그대로 사용
 */

export interface InstagramUploadOptions {
    caption: string          // 설명 + 해시태그
    shareToFeed?: boolean    // 피드에도 공유 여부
}

const GRAPH_API = 'https://graph.instagram.com/v21.0'
const MAX_POLL = 20          // 최대 폴링 횟수
const POLL_INTERVAL = 5000   // 폴링 간격 (5초)

/**
 * 미디어 컨테이너 생성
 * 공개 URL을 Instagram 서버로 전달 → creation_id 반환
 */
async function createContainer(
    videoUrl: string,
    options: InstagramUploadOptions,
    accessToken: string,
    userId: string
): Promise<string> {
    const params = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoUrl,
        caption: options.caption,
        share_to_feed: String(options.shareToFeed ?? true),
        access_token: accessToken,
    })

    const res = await fetch(`${GRAPH_API}/${userId}/media`, {
        method: 'POST',
        body: params,
    })

    const json = await res.json()
    console.log('[Instagram] 컨테이너 생성 응답:', JSON.stringify(json))

    if (!res.ok || json.error) {
        const msg = json.error?.message || json.error?.code || res.statusText
        throw new Error(`Instagram 컨테이너 생성 실패: ${msg}`)
    }

    return json.id
}

/**
 * 미디어 처리 완료 대기 (폴링)
 */
async function waitForReady(creationId: string, accessToken: string): Promise<void> {
    for (let i = 0; i < MAX_POLL; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL))

        const res = await fetch(
            `${GRAPH_API}/${creationId}?fields=status_code,status&access_token=${accessToken}`
        )
        const json = await res.json()
        console.log(`[Instagram] 폴링 ${i + 1}/${MAX_POLL}: status_code=${json.status_code}`)

        if (json.status_code === 'FINISHED') return
        if (json.status_code === 'ERROR' || json.error) {
            throw new Error(`Instagram 미디어 처리 실패: ${json.status || json.error?.message}`)
        }
    }

    throw new Error('Instagram 미디어 처리 시간 초과 (최대 100초)')
}

/**
 * 미디어 게시
 */
async function publishMedia(
    creationId: string,
    accessToken: string,
    userId: string
): Promise<string> {
    const params = new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
    })

    const res = await fetch(`${GRAPH_API}/${userId}/media_publish`, {
        method: 'POST',
        body: params,
    })

    const json = await res.json()
    console.log('[Instagram] 게시 응답:', JSON.stringify(json))

    if (!res.ok || json.error) {
        const msg = json.error?.message || res.statusText
        throw new Error(`Instagram 게시 실패: ${msg}`)
    }

    return json.id  // 게시된 미디어 ID
}

/**
 * Instagram Reels 업로드 (메인 함수)
 *
 * @param videoPublicUrl - Supabase Storage 공개 URL
 * @param options - 캡션 등 업로드 옵션
 * @returns 게시된 미디어 ID
 */
export async function uploadToInstagram(
    videoPublicUrl: string,
    options: InstagramUploadOptions
): Promise<string> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const userId = process.env.INSTAGRAM_USER_ID

    if (!accessToken || !userId) {
        throw new Error('Instagram 인증 정보가 없습니다 (INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID)')
    }

    // 1단계: 컨테이너 생성
    const creationId = await createContainer(videoPublicUrl, options, accessToken, userId)
    console.log(`[Instagram] 컨테이너 생성 완료: ${creationId}`)

    // 2단계: 처리 완료 대기
    await waitForReady(creationId, accessToken)
    console.log('[Instagram] 미디어 처리 완료')

    // 3단계: 게시
    const mediaId = await publishMedia(creationId, accessToken, userId)
    console.log(`[Instagram] 게시 완료: ${mediaId}`)

    return mediaId
}

/**
 * Instagram 게시물 URL 생성
 */
export function getInstagramPostUrl(username: string): string {
    return `https://www.instagram.com/${username}/`
}
