/**
 * lib/ai/banned-word-generator.ts
 * 
 * AI 금칙어 자동 생성 로직
 * 
 * 최근 삭제/신고된 댓글 데이터를 분석하여 새로운 금칙어 후보를 탐지합니다.
 * 간단한 빈도 기반 분석으로 구현 (추후 LLM 기반으로 고도화 가능)
 * 
 * 프로세스:
 * 1. 최근 7일간 삭제된 댓글 (visibility='deleted') 조회
 * 2. 욕설/혐오 사유로 신고된 댓글 조회
 * 3. 단어 빈도 분석 (명사/형용사/동사만 추출)
 * 4. 기존 금칙어와 중복되지 않는 단어만 선택
 * 5. 빈도 상위 10개를 ai_banned_word로 추가
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server'

interface BannedWordCandidate {
    word: string
    frequency: number
    source: 'deleted' | 'reported'
}

/**
 * 한글 형태소 분석 (간단 버전)
 * 조사/어미 제거 및 명사 추출
 */
function extractKeywords(text: string): string[] {
    // 1. 특수문자 제거
    const cleaned = text.replace(/[^\w\sㄱ-ㅎ가-힣]/g, ' ')
    
    // 2. 공백 기준 단어 분리
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2)
    
    // 3. 조사 제거 (간단한 패턴)
    const keywords = words.map(word => {
        // 조사 패턴 제거
        return word
            .replace(/(이|가|을|를|은|는|의|에|에서|로|와|과|도|만|부터|까지|한테|께|에게)$/, '')
            .replace(/(이다|하다|되다|시키다)$/, '')
    }).filter(w => w.length >= 2)
    
    return keywords
}

/**
 * 단어 빈도 카운트
 */
function countFrequency(texts: string[]): Map<string, number> {
    const frequencyMap = new Map<string, number>()
    
    for (const text of texts) {
        const keywords = extractKeywords(text)
        for (const word of keywords) {
            frequencyMap.set(word, (frequencyMap.get(word) ?? 0) + 1
        }
    }
    
    return frequencyMap
}

/**
 * AI 금칙어 자동 생성
 * 
 * @param daysBack 분석할 과거 일수 (기본 7일)
 * @param limit 생성할 금칙어 개수 (기본 10개)
 * @returns 생성된 금칙어 목록
 */
export async function generateBannedWords(
    daysBack: number = 7,
    limit: number = 10
): Promise<{ generated: string[]; skipped: string[] }> {
    const admin = createSupabaseAdminClient()
    
    try {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - daysBack)
        
        // 1. 기존 금칙어 목록 로드
        const { data: existingRules } = await admin
            .from('safety_rules')
            .select('value')
            .in('kind', ['banned_word', 'ai_banned_word'])
        
        const existingWords = new Set(
            (existingRules ?? []).map(r => r.value.toLowerCase())
        )
        
        // 2. 최근 삭제된 댓글 조회
        const { data: deletedComments } = await admin
            .from('comments')
            .select('body')
            .eq('visibility', 'deleted')
            .gte('created_at', cutoffDate.toISOString())
            .limit(500)
        
        // 3. 욕설/혐오 사유 신고 댓글 조회
        const { data: reportedComments } = await admin
            .from('reports')
            .select('comments(body)')
            .eq('reason', '욕설/혐오')
            .gte('created_at', cutoffDate.toISOString())
            .limit(500)
        
        // 4. 텍스트 데이터 수집
        const deletedTexts = (deletedComments ?? [])
            .map(c => c.body)
            .filter(Boolean)
        
        const reportedTexts = (reportedComments ?? [])
            .map(r => (r.comments as any)?.body)
            .filter(Boolean)
        
        if (deletedTexts.length === 0 && reportedTexts.length === 0) {
            console.log('[AI 금칙어] 분석할 데이터 없음')
            return { generated: [], skipped: [] }
        }
        
        // 5. 빈도 분석
        const allTexts = [...deletedTexts, ...reportedTexts]
        const frequencyMap = countFrequency(allTexts)
        
        // 6. 후보 선정 (빈도순 정렬)
        const candidates: BannedWordCandidate[] = Array.from(frequencyMap.entries())
            .filter(([word, freq]) => {
                // 필터링 조건
                if (word.length < 2 || word.length > 20) return false // 2~20자
                if (existingWords.has(word.toLowerCase())) return false // 중복 제외
                if (freq < 3) return false // 최소 3회 이상 출현
                if (/^[0-9]+$/.test(word)) return false // 숫자만 제외
                return true
            })
            .map(([word, freq]) => ({
                word,
                frequency: freq,
                source: 'deleted' as const
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, limit)
        
        if (candidates.length === 0) {
            console.log('[AI 금칙어] 신규 금칙어 후보 없음')
            return { generated: [], skipped: [] }
        }
        
        // 7. DB에 저장
        const newWords = candidates.map(c => c.word)
        const insertData = newWords.map(word => ({
            kind: 'ai_banned_word',
            value: word
        }))
        
        const { error } = await admin
            .from('safety_rules')
            .insert(insertData)
        
        if (error) {
            console.error('[AI 금칙어] 저장 실패:', error)
            return { generated: [], skipped: newWords }
        }
        
        console.log(`[AI 금칙어] 생성 완료: ${newWords.length}개`)
        console.log('[AI 금칙어] 생성된 단어:', newWords.join(', '))
        
        return { generated: newWords, skipped: [] }
    } catch (error) {
        console.error('[AI 금칙어] 생성 실패:', error)
        return { generated: [], skipped: [] }
    }
}

/**
 * 특정 단어가 금칙어로 적합한지 검증
 * (추후 LLM 기반 검증으로 고도화 가능)
 */
export function validateBannedWordCandidate(word: string): boolean {
    // 기본 검증 규칙
    if (word.length < 2 || word.length > 20) return false
    if (/^[0-9]+$/.test(word)) return false
    if (/^[a-zA-Z]+$/.test(word)) return false // 영어 단어 제외
    
    // 일반적인 명사는 제외 (오탐 방지)
    const commonNouns = ['사람', '사실', '이야기', '생각', '문제', '의견', '내용']
    if (commonNouns.includes(word)) return false
    
    return true
}
