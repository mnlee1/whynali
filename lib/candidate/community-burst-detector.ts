/**
 * lib/candidate/community-burst-detector.ts
 *
 * [커뮤니티 급증 감지 시스템]
 *
 * 커뮤니티 게시글의 급증 패턴을 감지하여 "지금 막 터지는" 이슈를 빠르게 캐치합니다.
 * 뉴스보다 먼저 터지는 커뮤니티 반응을 활용합니다.
 *
 * 흐름:
 * 1. 최근 10분간 수집된 커뮤니티 글에서 키워드 추출
 * 2. 키워드별 등장 빈도 계산 (임계값: 10건)
 * 3. AI 검증 (Groq): 진짜 이슈인가?
 * 4. 네이버 뉴스 검색 (3건 이상 있어야 함)
 * 5. 긴급 이슈 생성
 *
 * 환경변수:
 * - ENABLE_COMMUNITY_BURST: 커뮤니티 급증 감지 활성화 (기본 false)
 * - COMMUNITY_BURST_THRESHOLD: 커뮤니티 급증 임계값 (기본 10건)
 * - COMMUNITY_BURST_WINDOW_MINUTES: 감지 시간 창 (기본 10분)
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { checkDuplicateIssue } from './duplicate-checker'
import { incrementApiUsage } from '@/lib/api-usage-tracker'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { tokenize } from './tokenizer'

const ENABLE_BURST = process.env.ENABLE_COMMUNITY_BURST === 'true'
const BURST_THRESHOLD = parseInt(
    process.env.COMMUNITY_BURST_THRESHOLD ?? '10'
)
const WINDOW_MINUTES = parseInt(
    process.env.COMMUNITY_BURST_WINDOW_MINUTES ?? '10'
)

interface KeywordBurst {
    keyword: string
    count: number
    posts: Array<{ id: string; title: string; created_at: string }>
}

/**
 * extractCommunityKeywords - 커뮤니티 글 제목에서 키워드 추출
 * 
 * 간단한 버전의 키워드 추출기입니다.
 * burst detection용으로 빠른 처리가 필요합니다.
 */
function extractCommunityKeywords(title: string): string[] {
    return tokenize(title).map(w => w.toLowerCase())
}

/**
 * verifyIssueByAI - AI로 이슈 여부 검증
 *
 * 단순 키워드 급증이 아니라 진짜 뉴스 가치가 있는 이슈인지 판단
 * (예: "ㅋㅋㅋ", "드립", "밈" 등은 필터링)
 */
async function verifyIssueByAI(
    keyword: string,
    sampleTitles: string[]
): Promise<{ isIssue: boolean; confidence: number; reason: string }> {
    try {
        const titlesText = sampleTitles.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n')
        
        const prompt = `커뮤니티에서 급증한 키워드가 뉴스 이슈가 될 만한지 판단:

키워드: "${keyword}"
관련 게시글:
${titlesText}

판단 기준:
1. 사회적 논란/사건 → 이슈 (예: 연예인 사건, 정치 이슈)
2. 단순 유행어/밈 → 이슈 아님 (예: "띵작", "레전드")
3. 스팸/홍보 → 이슈 아님
4. 정보 가치 없는 반응 → 이슈 아님 (예: "ㅋㅋㅋ", "헐")

응답 형식 (JSON만):
{
  "isIssue": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)"
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'llama-3.1-8b-instant',
                temperature: 0.2,
                max_tokens: 200,
            }
        )
        
        const result = parseJsonObject<{ isIssue: boolean; confidence: number; reason: string }>(content)
        if (!result) {
            return { isIssue: false, confidence: 0, reason: 'JSON 파싱 실패' }
        }
        
        await incrementApiUsage('groq', { calls: 1, successes: 1 })
        
        return {
            isIssue: result.isIssue && result.confidence >= 70,
            confidence: result.confidence,
            reason: result.reason,
        }
        
    } catch (error) {
        console.error('[AI 이슈 검증 에러]', error)
        await incrementApiUsage('groq', { calls: 1, failures: 1 })
        return { isIssue: false, confidence: 0, reason: `에러: ${error}` }
    }
}

/**
 * searchNaverNews - 네이버 뉴스 검색 (키워드로)
 */
async function searchNaverNews(keyword: string): Promise<number> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
        console.error('[네이버 뉴스 검색] API 키 없음')
        return 0
    }
    
    try {
        const url = new URL('https://openapi.naver.com/v1/search/news.json')
        url.searchParams.set('query', keyword)
        url.searchParams.set('display', '10')
        url.searchParams.set('sort', 'date')
        
        const response = await fetch(url.toString(), {
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
            },
        })
        
        if (!response.ok) {
            throw new Error(`네이버 API 에러 ${response.status}`)
        }
        
        const data = await response.json()
        return data.items?.length ?? 0
        
    } catch (error) {
        console.error('[네이버 뉴스 검색 에러]', error)
        return 0
    }
}

/**
 * detectCommunityBurst - 커뮤니티 급증 감지 (메인 함수)
 *
 * @returns 생성된 긴급 이슈 수
 */
export async function detectCommunityBurst(): Promise<number> {
    if (!ENABLE_BURST) {
        console.log('[커뮤니티 급증 감지] 비활성화됨 (ENABLE_COMMUNITY_BURST=false)')
        return 0
    }
    
    console.log(`[커뮤니티 급증 감지] 시작 (최근 ${WINDOW_MINUTES}분, 임계값: ${BURST_THRESHOLD}건)`)
    
    const cutoffTime = new Date(
        Date.now() - WINDOW_MINUTES * 60 * 1000
    ).toISOString()
    
    // 1단계: 최근 커뮤니티 수집 건 조회
    const { data: recentPosts, error } = await supabaseAdmin
        .from('community_collection')
        .select('id, title, created_at')
        .gte('created_at', cutoffTime)
        .is('issue_id', null)  // 아직 이슈에 연결 안 된 것만
        .order('created_at', { ascending: false })
    
    if (error || !recentPosts || recentPosts.length === 0) {
        console.log('[커뮤니티 급증 감지] 최근 게시글 없음')
        return 0
    }
    
    console.log(`  • 최근 ${WINDOW_MINUTES}분간 ${recentPosts.length}건 수집`)
    
    // 2단계: 키워드 추출 및 빈도 계산
    const keywordMap = new Map<string, Array<{ id: string; title: string; created_at: string }>>()
    
    for (const post of recentPosts) {
        const keywords = extractCommunityKeywords(post.title)
        for (const kw of keywords) {
            if (!keywordMap.has(kw)) {
                keywordMap.set(kw, [])
            }
            keywordMap.get(kw)!.push(post)
        }
    }
    
    // 3단계: 급증 키워드 필터링 (임계값 이상)
    const burstKeywords: KeywordBurst[] = []
    for (const [keyword, posts] of keywordMap) {
        if (posts.length >= BURST_THRESHOLD) {
            burstKeywords.push({ keyword, count: posts.length, posts })
        }
    }
    
    if (burstKeywords.length === 0) {
        console.log('[커뮤니티 급증 감지] 급증 키워드 없음')
        return 0
    }
    
    // 빈도순 정렬
    burstKeywords.sort((a, b) => b.count - a.count)
    
    console.log(`  • 급증 키워드 ${burstKeywords.length}개 발견:`)
    for (const burst of burstKeywords.slice(0, 5)) {
        console.log(`    - "${burst.keyword}": ${burst.count}건`)
    }
    
    let createdCount = 0
    
    // 4단계: 상위 3개 키워드만 처리 (Rate Limit)
    for (const burst of burstKeywords.slice(0, 3)) {
        console.log(`\n[키워드 검증] "${burst.keyword}" (${burst.count}건)`)
        
        // 4-1. AI 이슈 검증
        const sampleTitles = burst.posts.slice(0, 5).map(p => p.title)
        const aiResult = await verifyIssueByAI(burst.keyword, sampleTitles)
        
        if (!aiResult.isIssue) {
            console.log(`  ✗ [AI 검증 실패] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
            continue
        }
        
        console.log(`  ✓ [AI 검증 통과] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
        
        // 4-2. 네이버 뉴스 검색
        const newsCount = await searchNaverNews(burst.keyword)
        
        if (newsCount < 3) {
            console.log(`  ✗ [뉴스 부족] 네이버 뉴스 ${newsCount}건 (최소 3건 필요)`)
            continue
        }
        
        console.log(`  ✓ [뉴스 충분] 네이버 뉴스 ${newsCount}건`)
        
        // 4-3. 중복 이슈 체크
        const issueTitle = `${burst.keyword} 관련 논란`
        const duplicateCheck = await checkDuplicateIssue(supabaseAdmin, issueTitle)
        
        if (duplicateCheck.isDuplicate) {
            console.log(`  ✗ [중복 이슈] "${duplicateCheck.existingIssue?.title}"`)
            
            // 기존 이슈에 커뮤니티 글 연결
            await supabaseAdmin
                .from('community_collection')
                .update({ issue_id: duplicateCheck.existingIssue!.id })
                .in('id', burst.posts.map(p => p.id))
            
            continue
        }
        
        // 4-4. 긴급 이슈 생성
        const { data: newIssue, error: createError } = await supabaseAdmin
            .from('issues')
            .insert({
                title: issueTitle,
                description: null,
                status: '점화',
                category: '사회',  // 기본 카테고리
                approval_status: '대기',
                is_urgent: true,
                burst_level: 2,  // 커뮤니티 급증은 중간 레벨
                source_track: 'community_burst',
            })
            .select('id')
            .single()
        
        if (createError || !newIssue) {
            console.error('[이슈 생성 에러]', createError)
            continue
        }
        
        // 커뮤니티 글 연결
        await supabaseAdmin
            .from('community_collection')
            .update({ issue_id: newIssue.id })
            .in('id', burst.posts.map(p => p.id))
        
        // 화력 계산 및 등록 시점 화력 저장
        const heatIndex = await calculateHeatIndex(newIssue.id).catch(() => 0)
        await supabaseAdmin
            .from('issues')
            .update({ 
                heat_index: heatIndex,
                created_heat_index: heatIndex  // 등록 시점 화력 저장
            })
            .eq('id', newIssue.id)
        
        console.log(`  ✅ [긴급 이슈 생성] "${issueTitle}" (ID: ${newIssue.id}, 화력: ${heatIndex}점)`)
        createdCount++
        
        // Rate Limit 방지 (AI 호출 간 대기)
        await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log(`\n[커뮤니티 급증 감지] 완료: ${createdCount}개 이슈 생성`)
    return createdCount
}
