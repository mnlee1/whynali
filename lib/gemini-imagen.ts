/**
 * lib/gemini-imagen.ts
 *
 * HuggingFace FLUX.1-schnell 무료 이미지 생성 유틸리티
 *
 * - 모델: black-forest-labs/FLUX.1-schnell (Apache 2.0, 상업 사용 가능)
 * - 인증: HF_TOKEN (Hugging Face Read 토큰)
 * - 과금: 없음 (HF Inference API 무료 티어)
 * - 용도: Vertex AI 크레딧 소진 후 자동 폴백 + 무료 테스트
 */

import { v2 as cloudinary } from 'cloudinary'
import { buildThumbnailPrompt } from './ai-thumbnail-prompt'

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell'
const HF_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`

function initCloudinary() {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    })
}

/**
 * HuggingFace FLUX.1-schnell로 이미지 생성 후 Cloudinary URL 반환
 * @returns Cloudinary 영구 URL — 실패 시 throw
 */
export async function generateGeminiFreeThumbnail(
    title: string,
    category: string,
    issueId: string
): Promise<string | null> {
    const hfToken = process.env.HF_TOKEN
    if (!hfToken) {
        console.warn('[HF-Free] HF_TOKEN 없음')
        return null
    }

    try {
        const prompt = await buildThumbnailPrompt(title, category)
        console.log(`[HF-Free] 이미지 생성 시작 — 이슈 ${issueId}: "${prompt}"`)

        const res = await fetch(HF_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    width: 1280,
                    height: 720,
                },
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error(`[HF-Free] API 오류 ${res.status}:`, errText)
            throw new Error(`API_ERROR:${res.status}:${errText}`)
        }

        const imageBuffer = await res.arrayBuffer()
        const base64 = Buffer.from(imageBuffer).toString('base64')

        initCloudinary()
        const uploaded = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${base64}`,
            {
                folder: 'whynali/ai-thumbnails',
                public_id: `issue-${issueId}-free-${Date.now()}`,
                overwrite: false,
            }
        )

        console.log(`[HF-Free] 완료 — ${uploaded.secure_url}`)
        return uploaded.secure_url
    } catch (err) {
        console.error('[HF-Free] 썸네일 생성 실패:', err)
        throw err
    }
}
