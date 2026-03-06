/**
 * lib/candidate/category-classifier.ts
 *
 * [AI 기반 카테고리 분류]
 *
 * 키워드 기반 분류의 신뢰도가 낮을 때 AI로 재분류하여 정확도를 높입니다.
 * Groq AI를 사용하여 맥락을 이해하고 올바른 카테고리를 판단합니다.
 */

import Groq from 'groq-sdk'
import type { IssueCategory } from '@/lib/config/categories'
import { incrementApiUsage } from '@/lib/api-usage-tracker'

let groqInstance: Groq | null = null

function getGroqClient(): Groq {
    if (!groqInstance) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
        }
        groqInstance = new Groq({
            apiKey: process.env.GROQ_API_KEY,
        })
    }
    return groqInstance
}

interface CategoryClassificationResult {
    category: IssueCategory
    confidence: number
    reason: string
}

/**
 * classifyCategoryByAI - AI로 카테고리 분류
 * 
 * @param titles - 이슈 제목들 (최대 5개)
 * @returns 카테고리, 신뢰도, 이유
 */
export async function classifyCategoryByAI(
    titles: string[]
): Promise<CategoryClassificationResult> {
    const enableAI = process.env.ENABLE_AI_CATEGORY === 'true'
    
    if (!enableAI) {
        throw new Error('AI 카테고리 분류가 비활성화되어 있습니다')
    }

    if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
    }

    const sampleTitles = titles.slice(0, 5).join('\n')

    const prompt = `다음 뉴스 제목들을 분석하여 가장 적합한 카테고리를 판단해주세요.

뉴스 제목:
${sampleTitles}

카테고리 선택지:
- 사회: 사건사고, 지역뉴스, 정책, 교육, 환경, 일반 사회 이슈
- 정치: 정부, 국회, 선거, 외교, 정당 관련
- 연예: 연예인, 드라마, 영화, 음악, 방송
- 기술: IT, 과학, 기술혁신, 스타트업
- 스포츠: 운동경기, 선수, 팀, 스포츠 이벤트

주의사항:
- "스포츠마케팅"처럼 스포츠 관련 단어가 있어도, 주제가 지역 관광이면 "사회"
- 연예인 관련 가짜뉴스/루머도 내용에 따라 "사회" 또는 "연예"
- 스포츠 선수의 비리/사건은 "사회"
- 정치인의 스포츠 활동은 "정치"

응답 형식 (JSON):
{
    "category": "사회" | "정치" | "연예" | "기술" | "스포츠",
    "confidence": 0-100,
    "reason": "판단 이유 1-2문장"
}

JSON만 출력하세요.`

    try {
        const groq = getGroqClient()
        
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: '당신은 뉴스 카테고리 분류 전문가입니다. 맥락을 정확히 이해하고 올바른 카테고리를 판단합니다.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.1,
            max_tokens: 200,
        })

        // API 사용량 추적
        await incrementApiUsage('groq', 'category_classification')

        const responseText = completion.choices[0]?.message?.content?.trim()
        if (!responseText) {
            throw new Error('AI 응답이 비어있습니다')
        }

        // JSON 파싱
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('JSON 형식을 찾을 수 없습니다')
        }

        const result = JSON.parse(jsonMatch[0]) as {
            category: string
            confidence: number
            reason: string
        }

        // 카테고리 검증
        const validCategories = ['사회', '정치', '연예', '기술', '스포츠']
        if (!validCategories.includes(result.category)) {
            throw new Error(`유효하지 않은 카테고리: ${result.category}`)
        }

        return {
            category: result.category as IssueCategory,
            confidence: result.confidence,
            reason: result.reason,
        }
    } catch (error) {
        console.error('[AI 카테고리 분류 에러]', error)
        throw error
    }
}

/**
 * shouldUseAIClassification - AI 분류 사용 여부 판단
 * 
 * 신뢰도가 낮은 경우에만 AI를 사용하여 비용 절감
 * 
 * @param keywordScore - 키워드 매칭 점수
 * @param hasContextMatch - 맥락 규칙 매칭 여부
 * @param majorityScore - 다수결 점수
 * @returns AI 사용 여부
 */
export function shouldUseAIClassification(
    keywordScore: number,
    hasContextMatch: boolean,
    majorityScore: number
): boolean {
    const enableAI = process.env.ENABLE_AI_CATEGORY === 'true'
    
    if (!enableAI) {
        return false
    }

    // 맥락 규칙 매칭되었으면 신뢰도 높음 → AI 불필요
    if (hasContextMatch && keywordScore >= 3) {
        return false
    }

    // 키워드 점수가 너무 낮음 → AI 필요
    if (keywordScore < 3) {
        return true
    }

    // 다수결과 키워드가 불일치 → AI 필요
    if (majorityScore > 0 && keywordScore > 0) {
        return true
    }

    return false
}
