/**
 * lib/ai/perplexity-grouping.ts
 *
 * [Perplexity AI 기반 뉴스 그루핑]
 *
 * 수집된 뉴스 제목들을 Perplexity AI에게 보내서
 * "같은 이슈끼리 묶어달라"고 요청하는 방식.
 * 키워드 매칭보다 정확하게 같은 사건/인물/논란을 그룹화한다.
 *
 * 비용: 월 약 ₩4 (30분마다 100건 배치 처리 기준)
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'

interface NewsItem {
    id: string
    title: string
}

/**
 * groupNewsByPerplexity - Perplexity AI로 뉴스 그루핑
 *
 * @param items - 그루핑할 뉴스 아이템 배열
 * @returns 그룹 인덱스 배열의 배열 (예: [[0,1,5], [2,3], [4]])
 *
 * 예시:
 *   입력: [{id:'n1', title:'민희진 256억'}, {id:'n2', title:'민희진 기자회견'}, ...]
 *   출력: [[0,1], [2,3,4], ...]
 *   의미: 0번과 1번이 같은 이슈, 2·3·4번이 같은 이슈
 *
 * 주의: 1회 최대 100건까지만 처리 (토큰 제한 및 정확도)
 */
export async function groupNewsByPerplexity(
    items: NewsItem[]
): Promise<number[][]> {
    if (items.length === 0) {
        return []
    }

    // 1개면 그루핑 불필요
    if (items.length === 1) {
        return [[0]]
    }

    // 100건 초과 시 경고 (배치 크기 제한)
    if (items.length > 100) {
        console.warn(`[경고] AI 그루핑은 100건까지만 지원. ${items.length}건 중 처음 100건만 처리`)
        items = items.slice(0, 100)
    }

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
        console.warn('PERPLEXITY_API_KEY 없음, AI 그루핑 스킵')
        // 폴백: 모든 아이템을 개별 그룹으로
        return items.map((_, i) => [i])
    }

    // 프롬프트 구성
    const titles = items.map((item, i) => `${i}. ${item.title}`).join('\n')

    const prompt = `다음 뉴스 제목들을 같은 이슈끼리 그룹으로 묶어줘.

규칙:
- 같은 사건, 같은 인물, 같은 논란이면 한 그룹으로 묶는다
- 예: "민희진 256억 포기", "민희진 비매너 논란", "민희진 기자회견" → 모두 같은 그룹
- 단어가 우연히 겹치는 무관한 기사는 다른 그룹으로 분리
- 출력 형식: 2차원 배열 [[0,1,5], [2,3], [4]]
- **설명 없이 배열만 반환**
- 반드시 완전한 형태로 반환: [[...], [...]]

제목 목록:
${titles}

출력:`

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
                max_tokens: 500,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Perplexity API 에러 ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content?.trim() ?? ''

        // Perplexity API 응답에서 토큰 사용량 추출
        const usage = data.usage || {}
        const inputTokens = usage.prompt_tokens || 0
        const outputTokens = usage.completion_tokens || 0

        console.log('[Perplexity Grouping] 토큰 사용량:', { inputTokens, outputTokens, total: inputTokens + outputTokens })

        // API 사용량 추적 (성공 + 토큰 정보)
        await incrementApiUsage('perplexity', {
            calls: 1,
            successes: 1,
            failures: 0,
            inputTokens,
            outputTokens,
        }).catch(err => console.error('API 사용량 추적 실패:', err))

        // JSON 파싱
        const groups = parseGroupingResult(content, items.length)
        console.log(`AI 그루핑 완료: ${items.length}건 → ${groups.length}개 그룹`)
        return groups

    } catch (error) {
        console.error('Perplexity 그루핑 실패:', error)

        // API 사용량 추적 (실패)
        await incrementApiUsage('perplexity', {
            calls: 1,
            successes: 0,
            failures: 1,
        }).catch(err => console.error('API 사용량 추적 실패:', err))

        // 폴백: 모든 아이템을 개별 그룹으로 (기존 키워드 방식이 처리)
        return items.map((_, i) => [i])
    }
}

/**
 * parseGroupingResult - Perplexity 응답에서 그룹 배열 추출
 *
 * Perplexity는 채팅 모델이라 설명을 붙여서 응답할 수 있음:
 * "물론입니다. 분석 결과입니다:\n[[0,1,2], [3,4]]\n이렇게 묶었습니다."
 *
 * 이런 응답에서 [[...]] 부분만 추출해서 파싱한다.
 */
function parseGroupingResult(rawContent: string, totalItems: number): number[][] {
    try {
        console.log(`[디버그] Perplexity 원본 응답 (처음 500자):`, rawContent.substring(0, 500))
        
        // 1. [[...]] 패턴 추출
        const jsonMatch = rawContent.match(/\[\[[\s\S]*?\]\]/)
        if (!jsonMatch) {
            throw new Error('JSON 배열 형식 없음')
        }

        // 2. 빈 배열 제거 (Perplexity가 [,,,,] 형태로 반환)
        const cleanedJson = jsonMatch[0]
            .replace(/,\s*,/g, ',')  // ,, → ,
            .replace(/\[,/g, '[')     // [, → [
            .replace(/,\]/g, ']')     // ,] → ]
            .replace(/,\s*,/g, ',')  // 한번 더 (,,,, 같은 경우)

        console.log(`[디버그] 정리된 JSON (처음 200자):`, cleanedJson.substring(0, 200))

        const parsed = JSON.parse(cleanedJson) as number[][]

        // 3. 유효성 검증 및 빈 배열 필터링
        if (!Array.isArray(parsed)) {
            throw new Error('배열이 아님')
        }

        // 빈 배열 제거
        const nonEmptyGroups = parsed.filter(group => 
            Array.isArray(group) && group.length > 0
        )

        console.log(`[디버그] ${parsed.length}개 그룹 → 빈 배열 제거 후 ${nonEmptyGroups.length}개`)

        // 모든 인덱스가 범위 내인지 확인
        const allIndices = new Set<number>()
        for (const group of nonEmptyGroups) {
            for (const idx of group) {
                if (typeof idx !== 'number' || idx < 0 || idx >= totalItems) {
                    console.warn(`잘못된 인덱스 발견: ${idx} (범위: 0-${totalItems-1})`)
                    continue
                }
                allIndices.add(idx)
            }
        }

        // 누락된 인덱스를 개별 그룹으로 추가
        const result = [...nonEmptyGroups]
        for (let i = 0; i < totalItems; i++) {
            if (!allIndices.has(i)) {
                result.push([i])
            }
        }

        console.log(`[디버그] 최종 ${result.length}개 그룹 (누락 인덱스 추가됨)`)

        return result

    } catch (error) {
        console.error('Perplexity 응답 파싱 실패:', rawContent.substring(0, 200), error)
        // 폴백: 모든 아이템을 개별 그룹으로
        return Array.from({ length: totalItems }, (_, i) => [i])
    }
}

/**
 * applyAIGrouping - AI 그루핑 결과를 RawItem 그룹으로 변환
 *
 * Perplexity가 반환한 인덱스 배열을 실제 아이템 그룹으로 변환한다.
 *
 * @param items - 원본 아이템 배열
 * @param groupIndices - AI가 반환한 그룹 인덱스 [[0,1], [2,3], ...]
 * @returns 그룹화된 아이템 배열
 */
export function applyAIGrouping<T>(
    items: T[],
    groupIndices: number[][]
): T[][] {
    return groupIndices.map(indices => 
        indices.map(idx => items[idx])
    )
}
