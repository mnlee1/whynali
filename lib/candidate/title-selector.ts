/**
 * lib/candidate/title-selector.ts
 * 
 * [대표 제목 선택 유틸리티]
 * 
 * 그룹 내 여러 제목 중 가장 대표성 있는 제목을 선택합니다.
 * 언론 접두어를 제거하고, 핵심 키워드를 가장 많이 포함한 제목을 우선합니다.
 * 
 * 예시:
 * const title = selectRepresentativeTitle(items)
 * // "윤석열 대통령 긴급 기자회견 개최"
 */

import { tokenize } from './tokenizer'

export interface RawItem {
    id: string
    title: string
    created_at: string
    type: 'news' | 'community'
    category: string | null
    source: string | null
}

/**
 * stripMediaPrefix - 언론 접두어 제거
 *
 * 뉴스 기사 제목 앞의 [단독], [속보], [해외연예] 같은 언론사 형식 접두어를 제거합니다.
 * 이 접두어가 이슈 제목에 남아 있으면 토큰을 오염시켜 threshold를 불필요하게 높입니다.
 *
 * 예시:
 * stripMediaPrefix("[해외연예] 조로사, 팔로워 1억 돌파")
 * // "조로사, 팔로워 1억 돌파"
 */
export function stripMediaPrefix(title: string): string {
    return title
        .replace(/^(\[[^\]]{1,30}\]\s*)+/, '')
        .replace(/\.{2,}$/, '')
        .trim()
}

/**
 * selectRepresentativeTitle - 그룹 내 대표 제목 선택
 *
 * 접두어 제거 후 가장 정보가 풍부하면서도 핵심 키워드를 잘 포함하는 제목을 선택합니다.
 * 
 * 기준:
 * 1. 그룹 내 빈출 키워드(핵심 인물/주제)를 가장 많이 포함한 제목 우선
 * 2. 빈출 키워드 포함 수가 같으면, 전체 키워드(토큰) 개수가 많은 제목 우선 (상세한 설명)
 * 3. 토큰 개수도 같으면, 글자 수가 긴 제목 우선
 * 
 * 예시:
 * selectRepresentativeTitle([
 *     { title: "윤석열 대통령 긴급 회견", ... },
 *     { title: "대통령 긴급 기자회견 개최", ... }
 * ])
 * // "대통령 긴급 기자회견 개최" (더 상세한 제목 선택)
 */
export function selectRepresentativeTitle(items: RawItem[]): string {
    const allTokensList = items.map(i => {
        const cleanTitle = stripMediaPrefix(i.title)
        return {
            title: cleanTitle,
            tokens: tokenize(cleanTitle)
        }
    })

    const tokenFreq = new Map<string, number>()
    for (const item of allTokensList) {
        for (const t of item.tokens) {
            tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1)
        }
    }

    const threshold = Math.max(2, Math.ceil(items.length * 0.4))
    const coreKeywords = Array.from(tokenFreq.entries())
        .filter(([_, count]) => count >= threshold)
        .map(([t]) => t)

    const titlesWithInfo = allTokensList.map((item) => {
        const coreMatchCount = coreKeywords.filter(core => item.tokens.includes(core)).length
        
        const topKeywords = Array.from(tokenFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([t]) => t)
            
        const hasTopKeywords = topKeywords.some(top => item.tokens.includes(top))
        
        const penalty = hasTopKeywords ? 0 : -10

        return {
            title: item.title,
            coreMatchCount: coreMatchCount + penalty,
            tokenCount: item.tokens.length,
            length: item.title.length
        }
    })
    
    titlesWithInfo.sort((a, b) => {
        if (b.coreMatchCount !== a.coreMatchCount) {
            return b.coreMatchCount - a.coreMatchCount
        }
        if (b.tokenCount !== a.tokenCount) {
            return b.tokenCount - a.tokenCount
        }
        return b.length - a.length
    })
    
    return titlesWithInfo[0].title
}
