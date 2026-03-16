/**
 * lib/ai/parse-json-response.ts
 *
 * [AI 응답 JSON 파싱 유틸리티]
 *
 * AI 응답에서 JSON 객체/배열을 안전하게 추출하여 파싱합니다.
 * 마크다운 코드펜스 제거 → JSON.parse 시도 → 실패 시 정규식 추출 후 재시도
 */

/**
 * parseJsonObject - AI 응답에서 JSON 객체 추출 및 파싱
 * 
 * @param text AI 응답 텍스트
 * @returns 파싱된 객체 또는 null
 */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
    try {
        let cleaned = text.trim()
        
        // 마크다운 코드펜스 제거
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
        
        // 직접 파싱 시도
        try {
            return JSON.parse(cleaned) as T
        } catch {
            // 정규식으로 {...} 블록 추출
            const match = cleaned.match(/\{[\s\S]*\}/)
            if (match) {
                return JSON.parse(match[0]) as T
            }
        }
        
        return null
    } catch (error) {
        console.error('[JSON 파싱 실패]', error, text.substring(0, 100))
        return null
    }
}

/**
 * parseJsonArray - AI 응답에서 JSON 배열 추출 및 파싱
 * 
 * @param text AI 응답 텍스트
 * @returns 파싱된 배열 또는 null
 */
export function parseJsonArray<T = unknown>(text: string): T[] | null {
    try {
        let cleaned = text.trim()
        
        // 마크다운 코드펜스 제거
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
        
        // 직접 파싱 시도
        try {
            const parsed = JSON.parse(cleaned)
            if (Array.isArray(parsed)) {
                return parsed as T[]
            }
        } catch {
            // 정규식으로 [...] 블록 추출
            const match = cleaned.match(/\[[\s\S]*\]/)
            if (match) {
                const parsed = JSON.parse(match[0])
                if (Array.isArray(parsed)) {
                    return parsed as T[]
                }
            }
        }
        
        return null
    } catch (error) {
        console.error('[JSON 배열 파싱 실패]', error, text.substring(0, 100))
        return null
    }
}
