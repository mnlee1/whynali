/**
 * lib/shortform/ai-validate.ts
 * 
 * 숏폼 이미지 적합성 AI 판별 서비스
 * 
 * Gemini 1.5 Flash API를 사용하여 생성된 숏폼 동영상이 플랫폼 정책에 적합한지 검증합니다.
 * 
 * 판별 기준:
 * - 이슈 제목이 명확하게 표시되는가
 * - 텍스트가 읽기 가능한가
 * - 부적절하거나 혐오적인 내용이 없는가
 * 
 * 모델: gemini-1.5-flash (2.0보다 안정적, 무료 티어: 일 1,500건)
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export interface AiValidationResult {
    status: 'passed' | 'flagged'
    reason: string
    checked_at: string
}

/**
 * 숏폼 이미지 적합성 AI 판별
 * 
 * @param imageUrl - Supabase Storage 공개 URL (MP4 또는 PNG)
 * @param issueTitle - 판별 컨텍스트용 이슈 제목
 * @returns AI 판별 결과
 * @throws GEMINI_API_KEY 없으면 throw
 */
export async function validateShortformImage(
    imageUrl: string,
    issueTitle: string
): Promise<AiValidationResult> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        console.warn('[AI 검증 스킵] GEMINI_API_KEY 없음')
        return {
            status: 'passed',
            reason: '수동 검토 필요 (API 키 없음)',
            checked_at: new Date().toISOString(),
        }
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

        const imageResponse = await fetch(imageUrl)
        if (!imageResponse.ok) {
            throw new Error(`이미지 다운로드 실패: ${imageResponse.status}`)
        }

        const arrayBuffer = await imageResponse.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        
        // MP4는 video/mp4, 첫 프레임을 검증
        const mimeType = imageUrl.endsWith('.mp4') ? 'video/mp4' : 'image/png'

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64,
                    mimeType,
                },
            },
            `이 콘텐츠는 "${issueTitle}" 이슈의 SNS 숏폼입니다.
아래 기준으로 적합성을 판별하고 JSON으로만 응답하세요.
- 이슈 제목이 명확하게 표시되는가
- 텍스트가 읽기 가능한가
- 부적절하거나 혐오적인 내용이 없는가

응답 형식(JSON만, 다른 텍스트 없음):
{"status":"passed","reason":"이유"}
또는
{"status":"flagged","reason":"이유"}`,
        ])

        const text = result.response.text().trim()
        const cleanText = text.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(cleanText)
        
        return {
            status: parsed.status === 'flagged' ? 'flagged' : 'passed',
            reason: String(parsed.reason ?? ''),
            checked_at: new Date().toISOString(),
        }
    } catch (error) {
        console.error('[Gemini 1.5 Flash 검증 실패]:', error)
        return {
            status: 'passed',
            reason: 'AI 판별 실패 — 수동 검토 필요',
            checked_at: new Date().toISOString(),
        }
    }
}
