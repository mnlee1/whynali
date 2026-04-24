/**
 * lib/candidate/duplicate-checker.ts
 *
 * [AI 기반 중복 이슈 체크]
 *
 * 새로 생성하려는 이슈가 최근에 이미 등록된 이슈와 중복인지 AI로 검증합니다.
 * 제목이 다르더라도 같은 사건/논란이면 중복으로 판단합니다.
 *
 * 체크 단계:
 * 1. 정확한 제목 일치 (빠른 체크)
 * 2. 키워드 필터링 (AI 호출 줄이기)
 * 3. 안전 장치 (반대어, 숫자 차이)
 * 4. AI 정밀 비교 (Groq)
 *
 * 환경변수:
 * - DUPLICATE_CHECK_AI_CONFIDENCE: 중복 판단 신뢰도 (기본 80%)
 * - DUPLICATE_CHECK_WINDOW_HOURS: 비교 대상 시간 창 (기본 1시간)
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { tokenize } from './tokenizer'

interface DuplicateCheckResult {
    isDuplicate: boolean
    existingIssue?: {
        id: string
        title: string
    }
    confidence?: number
    reason?: string
    filterStats?: {
        candidates: number
        oppositeFiltered: number
        numberFiltered: number
        aiChecked: number
    }
}

interface WordRelation {
    words: string[]
    relation: 'opposite' | 'synonym'
}

const AI_CONFIDENCE_THRESHOLD = parseInt(
    process.env.DUPLICATE_CHECK_AI_CONFIDENCE ?? '80'
)
const CHECK_WINDOW_HOURS = parseInt(
    process.env.DUPLICATE_CHECK_WINDOW_HOURS ?? '1'
)
const CLOSED_CHECK_DAYS = parseInt(
    process.env.DUPLICATE_CHECK_CLOSED_DAYS ?? '14'
)

/**
 * 단어 관계 정의
 * - opposite: 반대어 관계 (같은 인물/주제지만 반대 사건)
 * - synonym: 유사어 관계 (같은 의미를 다르게 표현)
 */
const WORD_RELATIONS: WordRelation[] = [
    {
        words: ['복귀'],
        relation: 'opposite',
    },
    {
        words: ['사퇴', '퇴사', '하차'],
        relation: 'synonym',
    },
    {
        words: ['찬성'],
        relation: 'opposite',
    },
    {
        words: ['반대', '거부'],
        relation: 'synonym',
    },
    {
        words: ['승인'],
        relation: 'opposite',
    },
    {
        words: ['반려', '기각'],
        relation: 'synonym',
    },
    {
        words: ['기소'],
        relation: 'opposite',
    },
    {
        words: ['무혐의', '불기소'],
        relation: 'synonym',
    },
    {
        words: ['당선'],
        relation: 'opposite',
    },
    {
        words: ['낙선'],
        relation: 'opposite',
    },
    {
        words: ['체포'],
        relation: 'opposite',
    },
    {
        words: ['석방'],
        relation: 'opposite',
    },
    {
        words: ['합격'],
        relation: 'opposite',
    },
    {
        words: ['불합격'],
        relation: 'opposite',
    },
    {
        words: ['승리'],
        relation: 'opposite',
    },
    {
        words: ['패배'],
        relation: 'opposite',
    },
]

/**
 * extractKeywords - 제목에서 키워드 추출
 * 
 * tokenizer.ts의 tokenize를 사용하되 lowercase 변환 추가.
 * 중복 체크용으로 대소문자를 구분하지 않습니다.
 */
function extractKeywords(title: string): string[] {
    return tokenize(title).map(w => w.toLowerCase())
}

/**
 * hasOppositeWords - 반대어 체크
 * 
 * relation === 'opposite'인 단어 그룹만 검사합니다.
 * 유사어(synonym)는 같은 의미이므로 반대 사건으로 간주하지 않습니다.
 * 
 * 예시:
 * - "윤석열 복귀" vs "윤석열 사퇴" → true (반대 사건)
 * - "장관 사퇴" vs "장관 퇴사" → false (유사어, 같은 사건)
 */
function hasOppositeWords(title1: string, title2: string): boolean {
    const words1 = extractKeywords(title1)
    const words2 = extractKeywords(title2)
    
    const oppositeGroups = WORD_RELATIONS.filter(r => r.relation === 'opposite')
    
    for (const group of oppositeGroups) {
        const has1 = group.words.some(w => words1.includes(w))
        const has2 = group.words.some(w => words2.includes(w))
        
        if (has1 && !has2 || !has1 && has2) {
            return true
        }
        
        const word1 = group.words.find(w => words1.includes(w))
        const word2 = group.words.find(w => words2.includes(w))
        if (word1 && word2 && word1 !== word2) {
            return true
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
 * hasSignificantNumberDifference - 의미 있는 숫자 차이 (연속 사건)
 */
function hasSignificantNumberDifference(
    title1: string,
    title2: string
): boolean {
    const nums1 = extractNumbers(title1)
    const nums2 = extractNumbers(title2)
    
    if (nums1.length === 0 || nums2.length === 0) return false
    
    // "1차 회견" vs "2차 회견" 같은 경우
    for (const n1 of nums1) {
        for (const n2 of nums2) {
            if (Math.abs(n1 - n2) === 1 && n1 < 10 && n2 < 10) {
                return true
            }
        }
    }
    
    return false
}

/**
 * compareByAI - Groq AI로 정밀 비교
 */
async function compareByAI(
    newTitle: string,
    existingTitle: string
): Promise<{ isDuplicate: boolean; confidence: number; reason: string }> {
    try {
        const prompt = `두 이슈 제목이 같은 사건/논란인지 판단:

[신규] ${newTitle}
[기존] ${existingTitle}

판단 기준:
1. 완전히 같은 사건 → 중복
2. 같은 표현, 다른 단어 → 중복
3. 새로운 전개 → 별개
4. 반대 사건 → 별개
5. 연속 사건 (1차, 2차) → 별개

응답 형식 (JSON만):
{
  "isDuplicate": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)"
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                max_tokens: 200,
            }
        )
        
        const result = parseJsonObject<{ isDuplicate: boolean; confidence: number; reason: string }>(content)
        if (!result) {
            return { isDuplicate: false, confidence: 0, reason: 'JSON 파싱 실패' }
        }
        
        await incrementApiUsage('groq', { calls: 1, successes: 1 })
        
        return {
            isDuplicate: result.isDuplicate && result.confidence >= AI_CONFIDENCE_THRESHOLD,
            confidence: result.confidence,
            reason: result.reason,
        }
        
    } catch (error) {
        console.error('[AI 중복 체크 에러]', error)
        await incrementApiUsage('groq', { calls: 1, failures: 1 })
        
        return { isDuplicate: false, confidence: 0, reason: `에러: ${error}` }
    }
}

/**
 * checkDuplicateIssue - 중복 이슈 체크 (메인 함수)
 *
 * @param supabaseAdmin - Supabase Admin 클라이언트
 * @param newTitle - 새로 생성하려는 이슈 제목
 * @returns 중복 이슈 정보 및 필터링 통계
 */
export async function checkDuplicateIssue(
    supabaseAdmin: any,
    newTitle: string
): Promise<DuplicateCheckResult> {
    const filterStats = {
        candidates: 0,
        oppositeFiltered: 0,
        numberFiltered: 0,
        aiChecked: 0,
    }
    
    const recentCutoff = new Date(
        Date.now() - CHECK_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString()
    const closedCutoff = new Date(
        Date.now() - CLOSED_CHECK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    // 활성 이슈: 상태 기준 (기간 무관) — 점화/논란중 중인 이슈는 언제든 연결 대상
    // 비활성 이슈: 생성 시각 기준 1시간 이내 (단순 중복 방지)
    // 종결 이슈: 승인된 것만, 종결 후 14일 이내 (재점화 연결 대상)
    const [activeResult, recentResult, closedResult] = await Promise.all([
        supabaseAdmin
            .from('issues')
            .select('id, title, status, created_at')
            .in('status', ['점화', '논란중'])
            .in('approval_status', ['승인', '대기'])
            .order('updated_at', { ascending: false }),
        supabaseAdmin
            .from('issues')
            .select('id, title, status, created_at')
            .not('status', 'in', '(점화,논란중,종결)')
            .gte('created_at', recentCutoff)
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('issues')
            .select('id, title, status, created_at')
            .eq('status', '종결')
            .eq('approval_status', '승인')
            .gte('updated_at', closedCutoff)
            .order('updated_at', { ascending: false }),
    ])

    const issueMap = new Map<string, any>()
    ;[...(activeResult.data ?? []), ...(recentResult.data ?? []), ...(closedResult.data ?? [])]
        .forEach(i => { if (!issueMap.has(i.id)) issueMap.set(i.id, i) })
    const recentIssues = Array.from(issueMap.values())

    if (recentIssues.length === 0) {
        return { isDuplicate: false, filterStats }
    }

    console.log(`[중복 체크] "${newTitle}" vs ${recentIssues.length}건 (활성 ${activeResult.data?.length ?? 0} + 최근 ${recentResult.data?.length ?? 0} + 종결 ${closedResult.data?.length ?? 0})`)
    
    const exactMatch = recentIssues.find((i: any) => i.title === newTitle)
    if (exactMatch) {
        console.log(`  ✓ [정확 일치] "${exactMatch.title}"`)
        return {
            isDuplicate: true,
            existingIssue: exactMatch,
            confidence: 100,
            reason: '정확한 제목 일치',
            filterStats,
        }
    }
    
    const newKeywords = extractKeywords(newTitle)
    const candidates = recentIssues.filter((existing: any) => {
        const existingKeywords = extractKeywords(existing.title)
        const commonCount = newKeywords.filter(k => 
            existingKeywords.includes(k)
        ).length
        return commonCount >= 1
    })
    
    filterStats.candidates = candidates.length
    
    if (candidates.length === 0) {
        console.log(`  ✓ [키워드 필터] 공통 키워드 2개 이상인 이슈 없음`)
        return { isDuplicate: false, filterStats }
    }
    
    console.log(`  • [키워드 필터 통과] ${candidates.length}건`)
    
    for (const candidate of candidates.slice(0, 3)) {
        if (hasOppositeWords(newTitle, candidate.title)) {
            console.log(`  ✗ [반대어 감지] "${candidate.title}" (별개 사건)`)
            filterStats.oppositeFiltered++
            continue
        }
        
        if (hasSignificantNumberDifference(newTitle, candidate.title)) {
            console.log(`  ✗ [연속 사건] "${candidate.title}" (1차→2차 등)`)
            filterStats.numberFiltered++
            continue
        }
        
        console.log(`  ? [AI 검증] "${candidate.title}"`)
        filterStats.aiChecked++
        
        const aiResult = await compareByAI(newTitle, candidate.title)
        
        if (aiResult.isDuplicate) {
            console.log(
                `  ✓ [중복 확정] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`
            )
            return {
                isDuplicate: true,
                existingIssue: candidate,
                confidence: aiResult.confidence,
                reason: aiResult.reason,
                filterStats,
            }
        } else {
            console.log(
                `  ✗ [별개 확정] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`
            )
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log(`  ✓ [중복 없음] AI 검증 완료`)
    return { isDuplicate: false, filterStats }
}

/**
 * GroupMergeRecommendation - 그룹 병합 추천 결과
 */
export interface GroupMergeRecommendation {
    primaryIndex: number
    secondaryIndex: number
    primaryTitle: string
    secondaryTitle: string
    confidence: number
    reason: string
}

/**
 * detectDuplicateGroups - 같은 배치 내 쪼개진 그룹 감지
 * 
 * 키워드 그루핑 후 같은 카테고리 내에서 쪼개진 그룹들을
 * AI로 재검증하여 병합 추천 목록을 반환합니다.
 * 
 * @param groups 이슈 후보 그룹 배열 (originalIndex 포함)
 * @param category 카테고리 (같은 카테고리만 비교)
 * @returns 병합 추천 목록
 */
export async function detectDuplicateGroups(
    groups: Array<{ 
        originalIndex: number
        title: string
        category: string | null
        createdAt: string 
    }>,
    category: string
): Promise<GroupMergeRecommendation[]> {
    const recommendations: GroupMergeRecommendation[] = []
    
    const sameCategory = groups.filter(g => g.category === category)
    
    if (sameCategory.length < 2) {
        return recommendations
    }
    
    console.log(`\n[그룹 재검증] 카테고리 "${category}" 내 ${sameCategory.length}개 그룹 비교`)
    
    for (let i = 0; i < sameCategory.length; i++) {
        for (let j = i + 1; j < sameCategory.length; j++) {
            const group1 = sameCategory[i]
            const group2 = sameCategory[j]
            
            const timeDiff = Math.abs(
                new Date(group1.createdAt).getTime() - new Date(group2.createdAt).getTime()
            ) / (1000 * 60 * 60)
            
            if (timeDiff > 24) {
                continue
            }
            
            const keywords1 = extractKeywords(group1.title)
            const keywords2 = extractKeywords(group2.title)
            const commonCount = keywords1.filter(k => keywords2.includes(k)).length
            
            if (commonCount < 1) {
                continue
            }
            
            if (hasOppositeWords(group1.title, group2.title)) {
                console.log(`  ✗ [반대어] "${group1.title}" vs "${group2.title}"`)
                continue
            }
            
            if (hasSignificantNumberDifference(group1.title, group2.title)) {
                console.log(`  ✗ [연속 사건] "${group1.title}" vs "${group2.title}"`)
                continue
            }
            
            console.log(`  ? [AI 검증] "${group1.title}" vs "${group2.title}"`)
            
            const aiResult = await compareByAI(group1.title, group2.title)
            
            if (aiResult.isDuplicate) {
                console.log(`    ✓ [병합 추천] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
                
                recommendations.push({
                    primaryIndex: group1.originalIndex,
                    secondaryIndex: group2.originalIndex,
                    primaryTitle: group1.title,
                    secondaryTitle: group2.title,
                    confidence: aiResult.confidence,
                    reason: aiResult.reason,
                })
            } else {
                console.log(`    ✗ [별개 확정] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000))
        }
    }
    
    console.log(`[그룹 재검증 완료] ${recommendations.length}개 병합 추천\n`)
    
    return recommendations
}
