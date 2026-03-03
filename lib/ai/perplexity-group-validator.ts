/**
 * lib/ai/perplexity-group-validator.ts
 *
 * [Perplexity AI 그룹 검증]
 *
 * 키워드로 그루핑된 뉴스들이 실제로 하나의 사회적 이슈인지 AI로 검증.
 * 우연히 키워드만 겹친 무관한 기사들을 필터링한다.
 *
 * 비용 최적화:
 *   - 5건 이상 그룹만 검증 (노이즈는 이미 임계값으로 걸러짐)
 *   - 배치 처리로 API 호출 최소화
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'

interface GroupValidationInput {
    groupId: string
    titles: string[]
}

interface GroupValidationResult {
    groupId: string
    isIssue: boolean
    score: number
    reason: string
}

/**
 * validateGroups - 여러 그룹을 한 번에 AI 검증
 *
 * @param groups - 검증할 그룹 배열 (각 그룹은 제목 리스트)
 * @returns AI 검증 결과 배열
 */
export async function validateGroups(
    groups: GroupValidationInput[]
): Promise<GroupValidationResult[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
        throw new Error('PERPLEXITY_API_KEY 환경변수가 설정되지 않았습니다')
    }

    // Rate Limit 대응: 순차 처리 + 지연
    const results: GroupValidationResult[] = []
    for (const group of groups) {
        const result = await validateSingleGroup(group, apiKey)
        results.push(result)
        
        // API Rate Limit 방지: 요청 사이 500ms 대기 (300ms에서 증가)
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    return results
}

async function validateSingleGroup(
    group: GroupValidationInput,
    apiKey: string,
    retries = 3,
    retryDelay = 3000
): Promise<GroupValidationResult> {
    const titlesText = group.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')

    const prompt = `다음 뉴스 제목들을 분석해주세요.

[제목 목록]
${titlesText}

[분석 기준]
1. 이 제목들이 "하나의 사회적 이슈"를 다루는가?
   - Yes: 같은 사건, 논란, 인물을 다룸 (예: 윤석열 내란 재판, 에스파 일본 논란)
   - No: 우연히 키워드만 겹침 (예: "강자"라는 단어만 공통)

2. 사회적 파급력 점수 (0~10)
   - 8~10: 전국적 이슈 (대형 사건, 연예인 대형 논란, 주요 정치 이슈)
   - 5~7: 특정 집단 화제 (스포츠 경기 결과, 커뮤니티 이슈)
   - 0~4: 파급력 낮음 (홍보, 지역 소식, 무관한 기사들)

[응답 형식]
JSON 객체만 반환, 설명 없이:
{"isIssue": true/false, "score": 숫자, "reason": "한 문장 설명"}

예시:
{"isIssue": true, "score": 9, "reason": "윤석열 대통령 내란 재판 관련 보도"}
{"isIssue": false, "score": 2, "reason": "강자라는 단어만 공통, 무관한 기사들"}`

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 200,
            }),
        })

        // Rate Limit 재시도 (지수 백오프)
        if (response.status === 429 && retries > 0) {
            console.log(`그룹 ${group.groupId} Rate Limit, ${retries}번 재시도 남음, ${retryDelay}ms 대기`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            // 다음 재시도 시 대기 시간 2배 증가 (지수 백오프)
            return validateSingleGroup(group, apiKey, retries - 1, retryDelay * 2)
        }

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Perplexity API 에러 ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content?.trim() ?? ''

        // API 사용량 추적
        await incrementApiUsage('perplexity', {
            calls: 1,
            successes: 1,
            failures: 0,
        }).catch(err => console.error('API 사용량 추적 실패:', err))

        // JSON 파싱
        const result = parseValidationResult(content, group.groupId)
        console.log(`그룹 ${group.groupId} AI 응답:`, { isIssue: result.isIssue, score: result.score, reason: result.reason })
        return result
    } catch (error) {
        console.error(`그룹 ${group.groupId} AI 검증 실패:`, error)
        
        // API 사용량 추적 (실패)
        await incrementApiUsage('perplexity', {
            calls: 1,
            successes: 0,
            failures: 1,
        }).catch(err => console.error('API 사용량 추적 실패:', err))
        
        // 에러 시 안전하게 통과 (false negative보다 false positive가 나음)
        return {
            groupId: group.groupId,
            isIssue: true,
            score: 5,
            reason: 'AI 검증 실패, 기본값 사용',
        }
    }
}

function parseValidationResult(
    rawContent: string,
    groupId: string
): GroupValidationResult {
    try {
        // JSON 추출 (앞뒤 설명 제거)
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('JSON 형식 없음')
        }

        const parsed = JSON.parse(jsonMatch[0])

        return {
            groupId,
            isIssue: parsed.isIssue ?? true,
            score: Math.max(0, Math.min(10, parsed.score ?? 5)),
            reason: parsed.reason ?? '파싱 실패',
        }
    } catch (error) {
        console.error(`그룹 ${groupId} 응답 파싱 실패:`, rawContent, error)
        return {
            groupId,
            isIssue: true,
            score: 5,
            reason: '파싱 실패, 기본값 사용',
        }
    }
}
