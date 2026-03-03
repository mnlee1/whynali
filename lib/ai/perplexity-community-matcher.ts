/**
 * lib/ai/perplexity-community-matcher.ts
 * 
 * [Groq AI 커뮤니티 매칭]
 * 
 * 이슈 제목과 커뮤니티 제목이 같은 주제인지 AI로 판단
 * 키워드 기반 매칭의 한계(도돌이표 문제)를 근본적으로 해결
 * Groq API 사용 (무료, Llama 3.1 모델)
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'

interface MatchInput {
    issueTitle: string
    communityTitle: string
}

interface MatchResult {
    isMatch: boolean
    confidence: number  // 0-100
    reason: string
}

/**
 * matchCommunity - 이슈와 커뮤니티 글이 같은 주제인지 AI 판단
 * 
 * @param issueTitle - 이슈 제목
 * @param communityTitle - 커뮤니티 글 제목
 * @returns AI 매칭 결과
 */
export async function matchCommunity(
    issueTitle: string,
    communityTitle: string
): Promise<MatchResult> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        throw new Error('GROQ_API_KEY 환경변수가 설정되지 않았습니다')
    }

    const prompt = `다음 두 제목이 같은 주제/이슈를 다루고 있는지 판단해주세요.

[이슈 제목]
${issueTitle}

[커뮤니티 글 제목]
${communityTitle}

판단 기준:
1. 같은 인물/사건/제품을 다루는가?
2. 단순히 키워드만 겹치는가, 아니면 실제 같은 맥락인가?
3. 예시:
   - O: "민희진 뉴진스 복귀" vs "민희진 하이브 소송" → 같은 인물, 관련 사건 (매칭)
   - X: "현대카드 금융교육" vs "현대카드 애플페이" → 같은 브랜드, 다른 주제 (비매칭)
   - X: "배우 결혼" vs "배우 영화 출연" → 다른 인물 (비매칭)

응답 형식 (JSON):
{
  "isMatch": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)"
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
                        content: '당신은 뉴스/커뮤니티 제목의 주제 일치 여부를 판단하는 전문가입니다. 정확한 JSON 형식으로만 응답하세요.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.1,
                max_tokens: 200,
                response_format: { type: 'json_object' }
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            
            // Rate Limit 에러는 조용히 처리 (fallback으로 전환)
            if (response.status === 429) {
                console.log(`[AI Rate Limit] 토큰 방식으로 전환`)
                return {
                    isMatch: false,
                    confidence: 0,
                    reason: 'Rate Limit'
                }
            }
            
            throw new Error(`Groq API 에러 ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || '{}'

        const result = parseMatchResult(content)
        
        await incrementApiUsage('groq', 'community-matching', 1)
        
        console.log(`[AI 매칭] "${issueTitle.substring(0, 30)}..." vs "${communityTitle.substring(0, 30)}..." → ${result.isMatch ? 'O' : 'X'} (${result.confidence}%)`)
        
        return result

    } catch (error) {
        console.error('[AI 매칭 에러]', error)
        return {
            isMatch: false,
            confidence: 0,
            reason: 'AI 매칭 실패'
        }
    }
}

/**
 * parseMatchResult - AI 응답을 파싱
 */
function parseMatchResult(content: string): MatchResult {
    try {
        // JSON 추출 (마크다운 코드 블록 제거)
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('JSON 형식 없음')
        }

        const parsed = JSON.parse(jsonMatch[0])
        
        return {
            isMatch: !!parsed.isMatch,
            confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
            reason: parsed.reason || '판단 완료'
        }
    } catch (error) {
        console.error('[AI 응답 파싱 에러]', error, content)
        return {
            isMatch: false,
            confidence: 0,
            reason: '파싱 실패'
        }
    }
}

/**
 * batchMatchCommunities - 여러 커뮤니티 글을 한 번에 매칭
 * 
 * Groq API TPM 제한 고려: 
 * - 최대 N개만 AI로 검사 (나머지는 토큰 매칭)
 * - 설정된 간격으로 호출하여 Rate Limit 방지
 * 
 * @param issueTitle - 이슈 제목
 * @param communityTitles - 커뮤니티 글 제목 배열
 * @param confidenceThreshold - 신뢰도 임계값 (기본 70)
 * @returns 매칭된 인덱스 배열
 */
export async function batchMatchCommunities(
    issueTitle: string,
    communityTitles: string[],
    confidenceThreshold: number = 70
): Promise<{ matchedIndices: number[], checkedCount: number, totalCount: number }> {
    const matched: number[] = []
    const MAX_AI_CHECKS = parseInt(process.env.AI_MATCHING_MAX_CHECKS || '10')
    const DELAY_MS = parseInt(process.env.AI_MATCHING_DELAY_MS || '3000')
    
    // AI 검사할 개수 제한
    const checkCount = Math.min(communityTitles.length, MAX_AI_CHECKS)
    
    if (communityTitles.length > MAX_AI_CHECKS) {
        console.log(`[AI 샘플링] ${communityTitles.length}개 중 상위 ${MAX_AI_CHECKS}개만 AI 검사`)
    }
    
    // 상위 N개만 AI로 검사
    let aiCheckedCount = 0
    for (let i = 0; i < checkCount; i++) {
        const result = await matchCommunity(issueTitle, communityTitles[i])
        
        // Rate Limit 발생 시 부분 결과 유지하고 중단
        if (result.reason === 'Rate Limit') {
            break
        }
        
        aiCheckedCount++
        
        if (result.isMatch && result.confidence >= confidenceThreshold) {
            matched.push(i)
        }
        
        // 다음 호출까지 대기
        if (i < checkCount - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS))
        }
    }
    
    return {
        matchedIndices: matched,
        checkedCount: aiCheckedCount,
        totalCount: communityTitles.length
    }
}
