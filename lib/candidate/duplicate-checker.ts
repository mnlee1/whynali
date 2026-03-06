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

interface DuplicateCheckResult {
    isDuplicate: boolean
    existingIssue?: {
        id: string
        title: string
    }
    confidence?: number
    reason?: string
}

const AI_CONFIDENCE_THRESHOLD = parseInt(
    process.env.DUPLICATE_CHECK_AI_CONFIDENCE ?? '80'
)
const CHECK_WINDOW_HOURS = parseInt(
    process.env.DUPLICATE_CHECK_WINDOW_HOURS ?? '1'
)

// 반대어 쌍 (같은 인물/주제지만 반대 사건)
const OPPOSITE_WORD_PAIRS = [
    ['복귀', '사퇴', '퇴사', '하차'],
    ['찬성', '반대', '거부'],
    ['승인', '반려', '기각'],
    ['기소', '무혐의', '불기소'],
    ['당선', '낙선'],
    ['체포', '석방'],
    ['합격', '불합격'],
    ['승리', '패배'],
]

/**
 * extractKeywords - 제목에서 키워드 추출 (간단 버전)
 */
function extractKeywords(title: string): string[] {
    return title
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .map(w => w.toLowerCase())
}

/**
 * hasOppositeWords - 반대어 체크
 */
function hasOppositeWords(title1: string, title2: string): boolean {
    const words1 = extractKeywords(title1)
    const words2 = extractKeywords(title2)
    
    for (const opposites of OPPOSITE_WORD_PAIRS) {
        const has1 = opposites.some(w => words1.includes(w))
        const has2 = opposites.some(w => words2.includes(w))
        
        // 한쪽에만 있으면 반대 사건
        if (has1 && !has2 || !has1 && has2) {
            return true
        }
        
        // 둘 다 있지만 다른 단어면 반대 사건
        const word1 = opposites.find(w => words1.includes(w))
        const word2 = opposites.find(w => words2.includes(w))
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
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        return { isDuplicate: false, confidence: 0, reason: 'API 키 없음' }
    }
    
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

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 200,
            }),
        })
        
        if (!response.ok) {
            throw new Error(`Groq API 에러 ${response.status}`)
        }
        
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content?.trim()
        
        // JSON 파싱
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return { isDuplicate: false, confidence: 0, reason: 'JSON 파싱 실패' }
        }
        
        const result = JSON.parse(jsonMatch[0])
        
        // API 사용량 추적
        await incrementApiUsage('groq', { calls: 1, successes: 1 })
        
        return {
            isDuplicate: result.isDuplicate && result.confidence >= AI_CONFIDENCE_THRESHOLD,
            confidence: result.confidence,
            reason: result.reason,
        }
        
    } catch (error) {
        console.error('[AI 중복 체크 에러]', error)
        await incrementApiUsage('groq', { calls: 1, failures: 1 })
        
        // 에러 시 안전하게 별개로 처리
        return { isDuplicate: false, confidence: 0, reason: `에러: ${error}` }
    }
}

/**
 * checkDuplicateIssue - 중복 이슈 체크 (메인 함수)
 *
 * @param supabaseAdmin - Supabase Admin 클라이언트
 * @param newTitle - 새로 생성하려는 이슈 제목
 * @returns 중복 이슈 정보 또는 null
 */
export async function checkDuplicateIssue(
    supabaseAdmin: any,
    newTitle: string
): Promise<DuplicateCheckResult> {
    // 1단계: 최근 N시간 이슈 조회
    const cutoffTime = new Date(
        Date.now() - CHECK_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString()
    
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, created_at')
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false })
    
    if (!recentIssues || recentIssues.length === 0) {
        return { isDuplicate: false }
    }
    
    console.log(`[중복 체크] "${newTitle}" vs 최근 ${recentIssues.length}건 이슈`)
    
    // 2단계: 정확한 제목 일치 (빠른 체크)
    const exactMatch = recentIssues.find((i: any) => i.title === newTitle)
    if (exactMatch) {
        console.log(`  ✓ [정확 일치] "${exactMatch.title}"`)
        return {
            isDuplicate: true,
            existingIssue: exactMatch,
            confidence: 100,
            reason: '정확한 제목 일치',
        }
    }
    
    // 3단계: 키워드 필터링 (공통 키워드 2개 이상만 AI 체크)
    const newKeywords = extractKeywords(newTitle)
    const candidates = recentIssues.filter((existing: any) => {
        const existingKeywords = extractKeywords(existing.title)
        const commonCount = newKeywords.filter(k => 
            existingKeywords.includes(k)
        ).length
        return commonCount >= 2
    })
    
    if (candidates.length === 0) {
        console.log(`  ✓ [키워드 필터] 공통 키워드 2개 이상인 이슈 없음`)
        return { isDuplicate: false }
    }
    
    console.log(`  • [키워드 필터 통과] ${candidates.length}건`)
    
    // 4단계: 안전 장치 체크 (상위 3개만)
    for (const candidate of candidates.slice(0, 3)) {
        // 반대어 체크
        if (hasOppositeWords(newTitle, candidate.title)) {
            console.log(`  ✗ [반대어 감지] "${candidate.title}" (별개 사건)`)
            continue
        }
        
        // 숫자 차이 체크
        if (hasSignificantNumberDifference(newTitle, candidate.title)) {
            console.log(`  ✗ [연속 사건] "${candidate.title}" (1차→2차 등)`)
            continue
        }
        
        // 5단계: AI 정밀 비교
        console.log(`  ? [AI 검증] "${candidate.title}"`)
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
            }
        } else {
            console.log(
                `  ✗ [별개 확정] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`
            )
        }
        
        // Rate Limit 방지 (3초 대기)
        await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log(`  ✓ [중복 없음] AI 검증 완료`)
    return { isDuplicate: false }
}
