/**
 * lib/candidate/grouping-pipeline.ts
 * 
 * [이슈 후보 그루핑 파이프라인]
 * 
 * 뉴스 수집 건을 키워드 기반으로 그루핑하고,
 * 선택적으로 Perplexity AI로 그루핑을 수행합니다.
 * Supabase 쿼리 없이 순수 로직만 처리합니다.
 * 
 * 입력: RawItem[]
 * 출력: CandidateGroup[]
 * 
 * 예시:
 * const groups = groupItems(newsItems)
 * // [{ tokens: [...], items: [...] }, ...]
 */

import { tokenize } from './tokenizer'
import { selectRepresentativeTitle, type RawItem } from './title-selector'
import { groupNewsByPerplexity, applyAIGrouping } from '@/lib/ai/perplexity-grouping'

export interface CandidateGroup {
    tokens: string[]
    items: RawItem[]
}

/**
 * commonKeywordCount - 두 토큰 배열의 공통 키워드 수 반환
 * 
 * 완전 일치 + 부분 문자열 포함도 체크
 * 예: "내란"과 "내란죄" → 매칭
 * 
 * 주의: 제품명(갤럭시S26, 갤럭시버즈4)은 브랜드명이 포함되어도 다른 제품으로 취급
 */
export function commonKeywordCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((w) => w.toLowerCase()))
    let count = 0
    
    const productNamePattern = /^(갤럭시|아이폰|갤럭시버즈|에어팟|갤워치|애플워치)([a-z0-9]+)$/i
    
    for (const wordA of a) {
        const lowerA = wordA.toLowerCase()
        
        if (setB.has(lowerA)) {
            count++
            continue
        }
        
        if (lowerA.length >= 3) {
            for (const wordB of b) {
                const lowerB = wordB.toLowerCase()
                if (lowerB.length < 3) continue
                
                const aIsProduct = productNamePattern.test(lowerA)
                const bIsProduct = productNamePattern.test(lowerB)
                
                if (aIsProduct && bIsProduct) {
                    continue
                }
                
                if (lowerA.includes(lowerB) || lowerB.includes(lowerA)) {
                    count++
                    break
                }
            }
        }
    }
    
    return count
}

/**
 * fallbackTokenMatching - AI 매칭 실패 시 토큰 기반 매칭 (폴백)
 * 
 * 커뮤니티 글 제목과 대표 제목을 토큰 기반으로 매칭합니다.
 */
export function fallbackTokenMatching(
    communityTokenList: Array<{ id: string; title: string; tokens: string[] }>,
    representativeTitle: string,
    matchThreshold: number
): string[] {
    const representativeTokens = tokenize(representativeTitle)
    
    return communityTokenList
        .filter((c) => {
            const commonCount = commonKeywordCount(c.tokens, representativeTokens)
            if (commonCount >= matchThreshold) {
                console.log(`[토큰 매칭] "${c.title.substring(0, 40)}..." ← 공통: ${commonCount}개`)
                return true
            }
            return false
        })
        .map((c) => c.id)
}

/**
 * groupItems - 수집 건을 키워드 기반으로 후보 그룹으로 묶음
 *
 * 공통 키워드 2개 이상이면 같은 후보로 판단.
 * 단, 핵심 인물(3글자 이상 고유명사)이 공통이면 키워드 1개여도 같은 그룹.
 * 
 * 개선: 카테고리가 다르면 3개 이상 키워드 필요 (2개→3개로 상향)
 * 범용 단어 하나로 무관한 뉴스가 묶이는 문제 방지
 * 
 * 주의: 그룹 tokens를 합집합으로 갱신하지 않습니다.
 * 합집합 방식은 뉴스A→B→C 순서로 각 1개씩 공통이면 A와 C가 무관해도 같은 그룹이 되는
 * 연쇄 그루핑(chaining) 문제를 일으킵니다.
 * 그룹의 기준 토큰은 첫 번째 아이템으로 고정해 이를 방지합니다.
 */
export function groupItems(items: RawItem[]): CandidateGroup[] {
    const groups: CandidateGroup[] = []
    
    const corePersons = [
        // 정치
        '윤석열', '이재명', '한동훈', '이준석', '추경호', '박찬대', '권영세',
        // 연예
        '민희진', '뉴진스', '하이브', '어도어', '방시혁',
        '옥택연', '김연경', '서장훈', '추신수', '송혜교', '현빈', '블랙핑크',
        '에스파', '아이브', 'BTS', '세븐틴', '트와이스',
        // 스포츠
        '손흥민', '이강인', '황희찬', '김하성', '류현진', '오타니',
        // 기업/단체
        '삼성전자', 'LG전자', 'SK하이닉스', '네이버', '카카오',
    ]

    for (const item of items) {
        const tokens = tokenize(item.title)
        let matched = false

        for (const group of groups) {
            const commonCount = commonKeywordCount(tokens, group.tokens)
            
            const hasCommonPerson = tokens.some(t => 
                corePersons.includes(t) && group.tokens.includes(t)
            )
            
            const sameCategory = !item.category || !group.items[0].category || 
                                 item.category === group.items[0].category
            
            if (commonCount >= 3 || (commonCount >= 2 && sameCategory) || (commonCount >= 1 && hasCommonPerson)) {
                group.items.push(item)
                matched = true
                break
            }
        }

        if (!matched) {
            groups.push({ tokens, items: [item] })
        }
    }

    return mergeRelatedGroups(groups)
}

/**
 * mergeRelatedGroups - 유사한 그룹들을 병합
 * 
 * 그루핑 후 각 그룹의 대표 제목(가장 짧은 제목)을 추출하여
 * Jaccard 유사도가 0.4 이상이면 같은 이슈로 병합.
 * 
 * Jaccard 유사도 = 공통 키워드 수 / 전체 키워드 수 (합집합)
 * 예: A={윤석열, 내란, 무기징역}, B={윤석열, 내란, 법원, 사형}
 *     공통=2, 합집합=5, 유사도=2/5=0.4
 */
function mergeRelatedGroups(groups: CandidateGroup[]): CandidateGroup[] {
    if (groups.length <= 1) return groups

    const beforeCount = groups.length
    const merged: CandidateGroup[] = []
    const used = new Set<number>()

    for (let i = 0; i < groups.length; i++) {
        if (used.has(i)) continue

        const baseGroup = groups[i]
        const baseTitle = selectRepresentativeTitle(baseGroup.items)
        const baseTokens = tokenize(baseTitle)

        const toMerge = [baseGroup]
        
        for (let j = i + 1; j < groups.length; j++) {
            if (used.has(j)) continue

            const targetGroup = groups[j]
            const targetTitle = selectRepresentativeTitle(targetGroup.items)
            const targetTokens = tokenize(targetTitle)

            const intersection = commonKeywordCount(baseTokens, targetTokens)
            const union = new Set([...baseTokens, ...targetTokens]).size
            const similarity = union > 0 ? intersection / union : 0
            
            const coreKeywords = [
                // 정치
                '윤석열', '이재명', '한동훈', '이준석', '추경호', '박찬대', '권영세',
                // 연예
                '민희진', '뉴진스', '하이브', '어도어', '방시혁',
                '옥택연', '김연경', '서장훈', '추신수', '송혜교', '현빈', '블랙핑크',
                '에스파', '아이브', 'BTS', '세븐틴', '트와이스',
                // 스포츠
                '손흥민', '이강인', '황희찬', '김하성', '류현진', '오타니',
                // 기업/단체
                '삼성전자', 'LG전자', 'SK하이닉스', '네이버', '카카오',
            ]
            const hasCommonCorePerson = baseTokens.some(t => 
                coreKeywords.includes(t) && targetTokens.includes(t)
            )

            if (similarity >= 0.3 || hasCommonCorePerson) {
                console.log(`병합 검토: "${baseTitle}" vs "${targetTitle}"`)
                console.log(`  - 공통: ${intersection}개, 합집합: ${union}개, 유사도: ${(similarity * 100).toFixed(0)}%`)
                console.log(`  - Base 토큰: ${baseTokens.join(', ')}`)
                console.log(`  - Target 토큰: ${targetTokens.join(', ')}`)
                if (hasCommonCorePerson) console.log(`  - 공통 핵심 인물 있음!`)
            }

            if (similarity >= 0.4 || hasCommonCorePerson) {
                toMerge.push(targetGroup)
                used.add(j)
                console.log(`  ✓ 병합 완료!`)
            }
        }

        const mergedItems = toMerge.flatMap(g => g.items)
        merged.push({
            tokens: baseTokens,
            items: mergedItems,
        })
        used.add(i)
    }

    const afterCount = merged.length
    console.log(`그루핑 병합: ${beforeCount}개 → ${afterCount}개 (${beforeCount - afterCount}개 병합됨)`)

    return merged
}

/**
 * groupItemsByAI - Perplexity AI를 사용한 그루핑
 * 
 * 뉴스 아이템을 Perplexity AI에게 보내 의미 기반으로 그루핑합니다.
 * 배치 처리를 통해 대량의 뉴스를 효율적으로 처리합니다.
 * 
 * @param items 그루핑할 뉴스 아이템 배열
 * @param batchSize 배치당 최대 아이템 수 (기본 100)
 * @returns 그루핑된 CandidateGroup 배열
 */
export async function groupItemsByAI(
    items: RawItem[],
    batchSize: number = 100
): Promise<CandidateGroup[]> {
    console.log(`[AI 그루핑] ${items.length}건 뉴스 처리 시작`)
    
    const batches: RawItem[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize))
    }
    
    console.log(`[AI 그루핑] ${batches.length}개 배치로 분할 (배치당 최대 ${batchSize}건)`)
    
    const allGroups: CandidateGroup[] = []
    
    for (const [batchIdx, batch] of batches.entries()) {
        console.log(`[AI 그루핑] 배치 ${batchIdx + 1}/${batches.length} 처리 중 (${batch.length}건)`)
        
        try {
            const groupIndices = await groupNewsByPerplexity(
                batch.map(item => ({ id: item.id, title: item.title }))
            )
            
            const itemGroups = applyAIGrouping(batch, groupIndices)
            
            const batchGroups = itemGroups.map(groupItems => ({
                tokens: tokenize(selectRepresentativeTitle(groupItems)),
                items: groupItems,
            }))
            
            allGroups.push(...batchGroups)
            
            if (batchIdx < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        } catch (batchError) {
            console.error(`[AI 그루핑] 배치 ${batchIdx + 1} 실패, 키워드 방식으로 폴백:`, batchError)
            allGroups.push(...groupItems(batch))
        }
    }
    
    console.log(`[AI 그루핑 완료] ${items.length}건 → ${allGroups.length}개 그룹`)
    
    return allGroups
}
