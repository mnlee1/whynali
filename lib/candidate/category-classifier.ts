/**
 * lib/candidate/category-classifier.ts
 *
 * [AI 기반 카테고리 분류]
 *
 * 키워드 기반 분류의 신뢰도가 낮을 때 AI로 재분류하여 정확도를 높입니다.
 * Groq AI를 사용하여 맥락을 이해하고 올바른 카테고리를 판단합니다.
 */

import { aiClient } from '@/lib/ai/ai-client'
import type { IssueCategory } from '@/lib/config/categories'
import { incrementApiUsage } from '@/lib/api-usage-tracker'

interface CategoryClassificationResult {
    category: IssueCategory
    confidence: number
    reason: string
}

/**
 * extractJSON - AI 응답에서 JSON 객체만 안전하게 추출
 * 
 * AI가 JSON 외에 추가 텍스트를 붙여도 정확히 파싱합니다.
 * 
 * @param content - AI 응답 전체 텍스트
 * @returns JSON 문자열
 */
function extractJSON(content: string): string {
    // 1순위: 마크다운 코드 블록 (```json ... ```)
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim()
    }

    // 2순위: 중괄호 카운팅으로 완전한 JSON 객체 추출
    // 이 방법은 중첩된 객체도 정확히 처리하고, JSON 뒤의 추가 텍스트를 무시합니다
    let depth = 0
    let start = -1
    let inString = false
    let escapeNext = false

    for (let i = 0; i < content.length; i++) {
        const char = content[i]

        // 문자열 내부 처리 (따옴표 안의 중괄호는 무시)
        if (char === '"' && !escapeNext) {
            inString = !inString
            escapeNext = false
            continue
        }

        if (char === '\\' && inString) {
            escapeNext = !escapeNext
            continue
        }

        escapeNext = false

        // 문자열 밖에서만 중괄호 카운팅
        if (!inString) {
            if (char === '{') {
                if (depth === 0) start = i
                depth++
            } else if (char === '}') {
                depth--
                if (depth === 0 && start !== -1) {
                    return content.substring(start, i + 1)
                }
            }
        }
    }

    throw new Error('유효한 JSON 형식을 찾을 수 없습니다')
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

다음 8개 카테고리 중 하나로만 답하라:
- 사회: 국내 사건사고, 사회현상, 범죄, 재난
- 정치: 국회, 정당, 선거, 대통령, 정부 정책
- 연예: 아이돌, 배우, 가수, 드라마, 영화 (국내 연예인)
- 스포츠: 야구, 축구, 농구, 골프, 올림픽 등 스포츠 경기
- 경제: 주식, 부동산, 금리, 무역, 기업 실적, 고용
- IT과학: IT기업, 앱, AI, 반도체, 우주, 과학 연구
- 생활문화: 음식, 여행, 패션, 건강, 교육, 문화 공연
- 세계: 해외 정치, 국제 분쟁, 외교, 해외 사건

주의사항:
- "스포츠마케팅"처럼 스포츠 관련 단어가 있어도, 주제가 지역 관광/마케팅이면 "사회"
- "스포츠·IP 큐레이션", "스포츠브랜드" 등은 유통/패션 서비스이므로 "IT과학"
- 무신사, 쿠팡, 네이버쇼핑 등 이커머스 플랫폼의 신규 서비스는 "IT과학"
- 연예인 관련 가짜뉴스/루머도 내용에 따라 "사회" 또는 "연예"
- 스포츠 선수의 비리/사건은 "사회"
- 정치인의 스포츠 활동은 "정치"
- 실제 경기 결과, 선수 활동, 대회 관련만 "스포츠"

응답 형식:
반드시 아래 JSON 형식으로만 응답하세요. 다른 설명이나 추가 텍스트 없이 오직 JSON만 출력해야 합니다.

{
    "category": "사회" | "정치" | "연예" | "스포츠" | "경제" | "IT과학" | "생활문화" | "세계",
    "confidence": 0-100,
    "reason": "판단 이유 1-2문장"
}`

    try {
        const systemPrompt = '당신은 뉴스 카테고리 분류 전문가입니다. 맥락을 정확히 이해하고 올바른 카테고리를 판단합니다.'
        
        const completion = await aiClient.complete(prompt, {
            model: 'llama-3.1-8b-instant',
            temperature: 0.1,
            maxTokens: 200,
            systemPrompt,
        })

        // API 사용량 추적
        await incrementApiUsage('groq', { calls: 1, successes: 1, failures: 0 })

        const content = completion.trim()
        if (!content) {
            throw new Error('AI 응답이 비어있습니다')
        }

        // 안전한 JSON 추출 및 파싱
        const jsonString = extractJSON(content)
        const result = JSON.parse(jsonString) as {
            category: string
            confidence: number
            reason: string
        }

        // 카테고리 검증
        const validCategories = ['사회', '정치', '연예', '스포츠', '경제', 'IT과학', '생활문화', '세계']
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
