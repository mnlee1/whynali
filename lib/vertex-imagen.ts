/**
 * lib/vertex-imagen.ts
 *
 * Vertex AI Gemini 2.5 Flash Image 썸네일 생성 유틸리티
 *
 * - 모델: gemini-2.5-flash-image ($0.039/장, 16:9)
 * - 인증: kpi-sheets-writer@whynali-490723 서비스 계정 (편집자 권한)
 * - 과금: VERTEX_PROJECT_ID (lmn64257260@gmail.com 무료 체험 크레딧)
 * - 결과: Cloudinary 업로드 후 영구 URL 반환
 *
 * [마이그레이션 이력]
 * imagen-3.0-generate-002 → gemini-2.5-flash-image (June 2026 deprecated 대응)
 */

import { GoogleAuth } from 'google-auth-library'
import { v2 as cloudinary } from 'cloudinary'
import { buildThumbnailPrompt } from './ai-thumbnail-prompt'

const MODEL = 'gemini-2.5-flash-image'

function initCloudinary() {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    })
}

async function getAccessToken(): Promise<string> {
    const auth = new GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()
    if (!tokenResponse.token) throw new Error('Access token 발급 실패')
    return tokenResponse.token
}


/**
 * 이슈 제목/카테고리로 AI 썸네일 생성 후 Cloudinary URL 반환
 * @returns Cloudinary 영구 URL — 실패 시 null, 크레딧 소진 시 'CREDITS_EXHAUSTED' throw
 */
export async function generateVertexThumbnail(
    title: string,
    category: string,
    issueId: string
): Promise<string | null> {
    const projectId = process.env.VERTEX_PROJECT_ID
    const location = process.env.VERTEX_LOCATION ?? 'us-central1'

    if (!projectId) {
        console.warn('[Vertex] VERTEX_PROJECT_ID 환경변수 없음')
        return null
    }

    try {
        const [accessToken, prompt] = await Promise.all([
            getAccessToken(),
            buildThumbnailPrompt(title, category),
        ])

        console.log(`[Vertex] 이미지 생성 시작 — 이슈 ${issueId}: "${prompt}"`)

        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${MODEL}:generateContent`

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }],
                }],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                },
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error(`[Vertex] API 오류 ${res.status}:`, errText)
            if (res.status === 429 || res.status === 403 || errText.includes('RESOURCE_EXHAUSTED') || errText.includes('billing')) {
                throw new Error('CREDITS_EXHAUSTED')
            }
            throw new Error(`VERTEX_API_ERROR:${res.status}:${errText}`)
        }

        const data = await res.json()

        const parts: Array<{ inlineData?: { mimeType: string; data: string } }> =
            data.candidates?.[0]?.content?.parts ?? []
        const imagePart = parts.find(p => p.inlineData?.data)
        const base64 = imagePart?.inlineData?.data

        if (!base64) {
            const detail = JSON.stringify(data).slice(0, 300)
            console.error('[Vertex] 응답에 이미지 데이터 없음:', detail)
            throw new Error(`VERTEX_NO_IMAGE:${detail}`)
        }

        const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png'

        initCloudinary()
        const uploaded = await cloudinary.uploader.upload(
            `data:${mimeType};base64,${base64}`,
            {
                folder: 'whynali/ai-thumbnails',
                public_id: `issue-${issueId}-${Date.now()}`,
                overwrite: false,
            }
        )

        console.log(`[Vertex] 완료 — ${uploaded.secure_url}`)
        return uploaded.secure_url
    } catch (err) {
        if (err instanceof Error && (
            err.message === 'CREDITS_EXHAUSTED' ||
            err.message.startsWith('VERTEX_')
        )) throw err
        console.error('[Vertex] 썸네일 생성 실패:', err)
        return null
    }
}
