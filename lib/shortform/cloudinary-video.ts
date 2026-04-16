/**
 * lib/shortform/cloudinary-video.ts
 *
 * Cloudinary를 이용한 이미지 → 동영상 변환
 *
 * FFmpeg 대신 Cloudinary API를 사용하여 Vercel 서버리스 환경에서도
 * 줌/팬 모션 효과가 적용된 숏폼 영상을 생성합니다.
 *
 * 필수 환경변수:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

import { v2 as cloudinary } from 'cloudinary'
import type { ImageToVideoOptions } from './image-to-video'

function initCloudinary() {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    })
}

/**
 * 효과별 Cloudinary 변환 파라미터 반환
 */
function getCloudinaryEffect(effect: ImageToVideoOptions['effect'], duration: number): object[] {
    const du = `${duration}`

    switch (effect) {
        case 'zoom_in':
            return [
                { duration: du, effect: 'zoompan', zoom: '1.15', fps: 30 },
            ]
        case 'zoom_out':
            return [
                { duration: du, effect: 'zoompan:out', zoom: '1.15', fps: 30 },
            ]
        case 'zoom_fade':
            return [
                { duration: du, effect: 'zoompan', zoom: '1.1', fps: 30 },
                { effect: 'fade:300' },
                { effect: `fade:-300` },
            ]
        case 'pan_left':
            return [
                { duration: du, effect: 'zoompan:left', zoom: '1.1', fps: 30 },
            ]
        case 'pan_right':
            return [
                { duration: du, effect: 'zoompan:right', zoom: '1.1', fps: 30 },
            ]
        case 'Ken_burns':
            return [
                { duration: du, effect: 'zoompan', zoom: '1.2', fps: 30 },
                { effect: 'fade:500' },
                { effect: `fade:-500` },
            ]
        case 'none':
        default:
            return [
                { duration: du, fps: 30 },
            ]
    }
}

/**
 * 이미지 버퍼 → Cloudinary 업로드 → 모션 영상 생성 → MP4 버퍼 반환
 *
 * @param imageBuffer - PNG 이미지 버퍼
 * @param options - 변환 옵션 (duration, effect)
 * @returns MP4 동영상 버퍼
 */
export async function convertImageToVideoViaCloudinary(
    imageBuffer: Buffer,
    options: ImageToVideoOptions = {}
): Promise<Buffer> {
    initCloudinary()

    const duration = options.duration ?? 10
    const effect = options.effect ?? 'zoom_fade'
    const transformation = getCloudinaryEffect(effect, duration)

    // 1. 이미지를 base64로 변환하여 Cloudinary에 업로드
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`

    const uploadResult = await cloudinary.uploader.upload(base64Image, {
        resource_type: 'video',
        format: 'mp4',
        transformation,
        folder: 'shortform',
    })

    console.log(`[Cloudinary] 영상 생성 완료: ${uploadResult.secure_url}`)

    // 2. 생성된 MP4 다운로드
    const response = await fetch(uploadResult.secure_url)
    if (!response.ok) {
        throw new Error(`Cloudinary 영상 다운로드 실패: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
}
