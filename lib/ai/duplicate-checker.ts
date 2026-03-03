/**
 * lib/ai/duplicate-checker.ts
 * 
 * [AI 기반 이슈 중복 체크]
 * 
 * 제목만으로 같은 사건인지 판단 (날짜 무관)
 * 안전 장치: 반대어 체크, 숫자 차이, Confidence 임계값
 */

interface DuplicateCheckResult {
    isDuplicate: boolean
    confidence: number
    reason: string
}

/**
 * 반대 의미를 가진 단어 쌍
 */
const OPPOSITE_WORD_PAIRS = [
    ['복귀', '사퇴', '퇴사', '해임', '경질'],
    ['찬성', '반대', '거부'],
    ['승인', '반려', '기각'],
    ['기소', '무혐의', '불기소'],
    ['당선', '낙선'],
    ['합격', '불합격', '탈락'],
    ['결혼', '이혼'],
    ['출산', '유산'],
    ['증가', '감소', '하락'],
    ['상승', '하락', '폭락'],
    ['1차', '2차', '3차', '4차', '5차'],
]

/**
 * hasOppositeWords - 두 제목에 반대어가 포함되어 있는지 확인
 */
function hasOppositeWords(title1: string, title2: string): boolean {
    for (const pair of OPPOSITE_WORD_PAIRS) {
        const words1 = pair.filter(word => title1.includes(word))
        const words2 = pair.filter(word => title2.includes(word))
        
        // 둘 다 같은 그룹의 단어를 포함하지만, 다른 단어를 포함
        if (words1.length > 0 && words2.length > 0) {
            const hasDifferentWords = words1.some(w1 => !words2.includes(w1)) ||
                                     words2.some(w2 => !words1.includes(w2))
            if (hasDifferentWords) {
                console.log(`[반대어 감지] "${words1.join(',')}" vs "${words2.join(',')}"`)
                return true
            }
        }
    }
    return false
}

/**
 * extractNumbers - 제목에서 숫자 추출
 */
function extractNumbers(title: string): number[] {
    const matches = title.match(/\d+/g)
    return matches ? matches.map(n => parseInt(n)) : []
}

/**
 * hasSignificantNumberDifference - 의미 있는 숫자 차이가 있는지 확인
 */
function hasSignificantNumberDifference(title1: string, title2: string): boolean {
    const nums1 = extractNumbers(title1)
    const nums2 = extractNumbers(title2)
    
    // 둘 다 숫자가 있고, 겹치지 않으면 다른 이슈
    if (nums1.length > 0 && nums2.length > 0) {
        const hasCommon = nums1.some(n1 => nums2.includes(n1))
        if (!hasCommon) {
            console.log(`[숫자 차이] ${nums1} vs ${nums2}`)
            return true
        }
    }
    return false
}

/**
 * getCommonKeywords - 공통 핵심 키워드 개수
 */
function getCommonKeywords(title1: string, title2: string): string[] {
    const tokenize = (text: string) => {
        return text
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 2)
    }
    
    const tokens1 = tokenize(title1)
    const tokens2 = tokenize(title2)
    
    return tokens1.filter(t => tokens2.includes(t))
}

/**
 * checkDuplicateWithAI - AI로 중복 여부 판단
 */
export async function checkDuplicateWithAI(
    existingTitle: string,
    newTitle: string
): Promise<DuplicateCheckResult> {
    const apiKey = process.env.GROQ_API_KEY
    
    if (!apiKey) {
        console.log('[AI 중복 체크] API 키 없음, fallback')
        return { isDuplicate: false, confidence: 0, reason: 'API 키 없음' }
    }
    
    // 1단계: 빠른 제외 체크
    const commonKeywords = getCommonKeywords(existingTitle, newTitle)
    
    if (commonKeywords.length < 2) {
        return { 
            isDuplicate: false, 
            confidence: 100, 
            reason: '공통 키워드 부족 (키워드 기반)' 
        }
    }
    
    if (hasOppositeWords(existingTitle, newTitle)) {
        return { 
            isDuplicate: false, 
            confidence: 100, 
            reason: '반대 의미 사건 (안전 장치)' 
        }
    }
    
    if (hasSignificantNumberDifference(existingTitle, newTitle)) {
        return { 
            isDuplicate: false, 
            confidence: 100, 
            reason: '다른 차수/버전 (안전 장치)' 
        }
    }
    
    // 2단계: AI 정밀 체크
    console.log(`[AI 중복 체크] "${existingTitle}" vs "${newTitle}"`)
    
    const prompt = `다음 두 이슈 제목이 같은 사건/내용인지 판단해주세요.

[기존 이슈] ${existingTitle}
[새 이슈] ${newTitle}

판단 기준:
1. 완전히 같은 사건/내용이면 → 중복
2. 같은 인물/사건이지만 새로운 전개이면 → 별개 (예: "1차 회견" vs "2차 회견")
3. 반대되는 내용이면 → 별개 (예: "복귀" vs "사퇴")
4. 같은 표현을 다르게 쓴 것이면 → 중복 (예: "256억 포기" vs "금전 요구 포기")

응답 형식 (JSON):
{
  "isDuplicate": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 한 줄"
}

JSON만 반환하세요.`

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: '당신은 뉴스 이슈의 중복 여부를 판단하는 전문가입니다. 정확한 JSON 형식으로만 응답하세요.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.1,
                max_tokens: 200,
            }),
        })

        if (!response.ok) {
            if (response.status === 429) {
                console.log('[AI Rate Limit] 키워드 기반으로 fallback')
                // Rate Limit 시 보수적으로 별개 이슈로 처리
                return { isDuplicate: false, confidence: 0, reason: 'Rate Limit' }
            }
            throw new Error(`API 에러 ${response.status}`)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('JSON 형식 없음')
        }
        
        const result = JSON.parse(jsonMatch[0])
        
        const finalResult: DuplicateCheckResult = {
            isDuplicate: !!result.isDuplicate,
            confidence: Math.min(100, Math.max(0, parseInt(result.confidence) || 0)),
            reason: result.reason || 'AI 판단 완료'
        }
        
        // 3단계: Confidence 임계값 체크
        const CONFIDENCE_THRESHOLD = 80
        if (finalResult.isDuplicate && finalResult.confidence < CONFIDENCE_THRESHOLD) {
            console.log(`[신뢰도 부족] ${finalResult.confidence}% < ${CONFIDENCE_THRESHOLD}% → 별개 이슈로 처리`)
            return {
                isDuplicate: false,
                confidence: finalResult.confidence,
                reason: `신뢰도 부족 (${finalResult.confidence}%)`
            }
        }
        
        console.log(`[AI 판단] ${finalResult.isDuplicate ? '중복' : '별개'} (${finalResult.confidence}%) - ${finalResult.reason}`)
        
        return finalResult

    } catch (error) {
        console.error('[AI 중복 체크 에러]', error)
        // 에러 시 보수적으로 별개 이슈로 처리 (중복 놓치는 게 중요 이슈 누락보다 나음)
        return {
            isDuplicate: false,
            confidence: 0,
            reason: 'AI 체크 실패'
        }
    }
}
