/**
 * lib/linker/ai-news-validator.ts
 * 
 * [AI 기반 뉴스-이슈 관련도 검증]
 * 
 * Groq AI를 사용하여 뉴스가 이슈와 실제로 관련 있는지 판단합니다.
 * 배치 처리로 여러 뉴스를 한 번에 검증하여 토큰 효율성을 높입니다.
 */

import { aiClient } from '@/lib/ai/ai-client'

export interface NewsValidationResult {
    newsTitle: string
    isRelated: boolean
    confidence: number
    reason: string
}

interface BatchValidationResult {
    results: NewsValidationResult[]
    totalTokens?: number
}

/**
 * validateNewsRelevanceBatch - 여러 뉴스의 이슈 관련도를 배치로 검증
 * 
 * @param issueTitle 이슈 제목
 * @param newsTitles 검증할 뉴스 제목 배열 (최대 10개 권장)
 * @returns 각 뉴스의 관련도 판단 결과
 */
export async function validateNewsRelevanceBatch(
    issueTitle: string,
    newsTitles: string[]
): Promise<BatchValidationResult> {
    if (newsTitles.length === 0) {
        return { results: [] }
    }

    // 뉴스 목록 포맷팅
    const newsListFormatted = newsTitles
        .map((title, idx) => `${idx + 1}. ${title}`)
        .join('\n')

    const prompt = `다음 이슈와 관련된 뉴스인지 판단해주세요.

이슈:
"${issueTitle}"

뉴스 목록:
${newsListFormatted}

각 뉴스가 이슈와 실제로 관련 있는지 판단해주세요.

판단 기준:
- 같은 사건/주제를 다루면 관련 있음
- 단순히 같은 키워드가 있어도 다른 주제면 관련 없음
- 예: "스포츠 MICE 파크" vs "스포츠 중계" → 관련 없음
- 예: "김연경 IOC 수상" vs "김연경 은퇴" → 관련 없음 (다른 사건)

응답 형식 (JSON 배열):
[
    {
        "newsIndex": 1,
        "isRelated": true,
        "confidence": 95,
        "reason": "같은 잠실 스포츠 MICE 파크 사업을 다룸"
    },
    ...
]

JSON 배열만 출력하세요.`

    try {
        const content = await aiClient.complete(prompt, {
            model: 'llama-3.1-8b-instant',
            temperature: 0.1,
            maxTokens: 1000,
        })

        // JSON 파싱
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
            throw new Error('JSON 형식 파싱 실패')
        }

        const aiResults = JSON.parse(jsonMatch[0]) as Array<{
            newsIndex: number
            isRelated: boolean
            confidence: number
            reason: string
        }>

        // 결과 매핑
        const results: NewsValidationResult[] = newsTitles.map((title, idx) => {
            const aiResult = aiResults.find((r) => r.newsIndex === idx + 1)
            
            if (!aiResult) {
                // AI가 판단하지 못한 경우 보수적으로 관련 없음 처리
                return {
                    newsTitle: title,
                    isRelated: false,
                    confidence: 0,
                    reason: 'AI 판단 없음',
                }
            }

            return {
                newsTitle: title,
                isRelated: aiResult.isRelated,
                confidence: aiResult.confidence,
                reason: aiResult.reason,
            }
        })

        return {
            results,
        }
    } catch (error) {
        console.error('[AI 뉴스 검증 에러]', error)
        
        // 에러 시 모든 뉴스를 불확실(false)로 처리
        return {
            results: newsTitles.map((title) => ({
                newsTitle: title,
                isRelated: false,
                confidence: 0,
                reason: 'AI 검증 실패',
            })),
        }
    }
}

/**
 * 범용 키워드 목록 (단독으로는 관련도가 낮음)
 */
const GENERIC_KEYWORDS = new Set([
    '스포츠', '문화', '행사', '사업', '개최', '공연', '전시',
    '마케팅', '캠페인', '이벤트', '축제', '대회',
])

/**
 * shouldUseAI - AI 검증이 필요한지 판단
 * 
 * 키워드 매칭만으로 신뢰도가 낮은 경우 AI 검증 필요
 * 
 * @param issueKeywords 이슈 키워드
 * @param newsTitle 뉴스 제목
 * @param matchCount 일치한 키워드 수
 * @returns AI 검증 필요 여부
 */
export function shouldUseAI(
    issueKeywords: string[],
    newsTitle: string,
    matchCount: number
): boolean {
    // 1. 매칭 키워드가 적으면 AI 검증
    if (matchCount <= 3) {
        return true
    }

    // 2. 범용 키워드만 매칭되면 AI 검증
    const matchedGeneric = issueKeywords.filter((kw) => {
        const newsLower = newsTitle.toLowerCase()
        return newsLower.includes(kw.toLowerCase()) && GENERIC_KEYWORDS.has(kw)
    })

    if (matchedGeneric.length >= matchCount * 0.5) {
        return true
    }

    // 3. 매칭 키워드가 충분하면 AI 불필요
    return false
}
