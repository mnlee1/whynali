/**
 * app/api/cron/track-a/route.ts
 * 
 * [트랙 A: 커뮤니티 급증 → AI 판단 → 즉시 뉴스 검색 통합 크론]
 * 
 * 기존 3개 크론(detect-community-burst, filter-candidates, auto-create-issue)을
 * 하나로 통합한 새로운 아키텍처입니다.
 * 
 * 흐름:
 * 1. 더쿠·네이트판 커뮤니티 급증 감지
 * 2. Claude AI (claude-sonnet-4-6)로 "진짜 이슈인지" 판단
 * 3. YES이면 → Claude AI가 뽑은 키워드로 네이버 뉴스 API 즉시 타겟 검색
 * 4. 뉴스 1건 이상 발견 → 이슈 후보 등록 (approval_status='대기')
 * 5. 뉴스 0건 → 등록 보류 (루머 가능성)
 * 
 * 스케줄: 매 30분 (GitHub Actions: cron-track-a.yml)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject, parseJsonArray } from '@/lib/ai/parse-json-response'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { checkDuplicateIssue } from '@/lib/candidate/duplicate-checker'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import { tokenize } from '@/lib/candidate/tokenizer'
import { getCategoryIds, getCategoryKeywords } from '@/lib/config/categories'
import type { IssueCategory } from '@/lib/config/categories'
import { AUTO_APPROVE_CATEGORIES } from '@/lib/config/candidate-thresholds'
import { shouldSkipDueToRateLimit, recordRateLimitFailure, recordRateLimitSuccess } from '@/lib/ai/rate-limit-priority'
import { sendDoorayImmediateAlert } from '@/lib/dooray-notification'
import { validateIssueCreation, validateTrackAIssue } from '@/lib/validation/issue-creation'

const BURST_THRESHOLD = parseInt(process.env.COMMUNITY_BURST_THRESHOLD ?? '3')
const WINDOW_MINUTES = parseInt(process.env.COMMUNITY_BURST_WINDOW_MINUTES ?? '10')
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '8')
const AUTO_APPROVE_HEAT_THRESHOLD = parseInt(process.env.AUTO_APPROVE_HEAT_THRESHOLD ?? '30')

// Rate Limit 완화 설정
// 기본 3개: Groq Rate Limit을 고려해 한 번 실행당 최대 3개 키워드 처리
const MAX_KEYWORDS_PER_RUN = parseInt(process.env.TRACK_A_MAX_KEYWORDS ?? '1')
const AI_CALL_DELAY_MS = parseInt(process.env.TRACK_A_AI_DELAY_MS ?? '10000')  // AI 호출 간 대기 시간 (기본 10초)

/**
 * cleanupOrphanedRecords - 이슈 삭제 전 연결된 레코드의 issue_id를 null로 초기화
 *
 * community_data, news_data에 issue_id가 남아 있으면 고아 레코드가 되어
 * 해당 게시글/뉴스가 이후 다른 이슈에 연결되지 않는 문제가 발생합니다.
 */
async function cleanupOrphanedRecords(issueId: string): Promise<void> {
    await Promise.all([
        supabaseAdmin
            .from('community_data')
            .update({ issue_id: null })
            .eq('issue_id', issueId),
        supabaseAdmin
            .from('news_data')
            .update({ issue_id: null })
            .eq('issue_id', issueId),
    ])
}

// Rate Limit 전체 차단 에러 클래스
class AllKeysRateLimitedError extends Error {
    constructor(message: string = '모든 Groq API 키가 Rate Limit 상태입니다') {
        super(message)
        this.name = 'AllKeysRateLimitedError'
    }
}

interface KeywordBurst {
    keyword: string
    count: number
    posts: Array<{ id: string; title: string; created_at: string; source_site: string }>
}

interface AIVerificationResult {
    isIssue: boolean
    confidence: number
    reason: string
    searchKeyword: string
    category: IssueCategory  // AI가 분류한 카테고리
    tentativeTitle: string   // 임시 이슈 제목 (뉴스 검색 전)
}

/**
 * verifyCronRequest - 크론 요청 인증
 */
function verifyCronRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (!cronSecret) {
        console.error('[트랙 A] CRON_SECRET 환경변수 없음')
        return false
    }
    
    return authHeader === `Bearer ${cronSecret}`
}

/**
 * extractCommunityKeywords - 커뮤니티 글 제목에서 의미 있는 키워드만 추출
 * 
 * 개선: 불용어 제외, 길이 필터링으로 노이즈 제거
 */
function extractCommunityKeywords(title: string): string[] {
    // 한국어 불용어 목록 (조사, 감탄사, 일반 형용사/부사)
    const STOPWORDS = new Set([
        // 조사/어미
        '이', '가', '을', '를', '의', '에', '도', '는', '은', '과', '와', '로', '으로',
        '이다', '입니다', '합니다', '했다', '한다', '하다', '되다', '이라',
        // 일반 부사/형용사
        '진짜', '정말', '완전', '너무', '대박', '엄청', '정말로', '매우',
        '같은', '다른', '이런', '저런', '그런', '어떤', '무슨',
        '하면', '하는', '했다', '할', '한', '이렇게', '저렇게', '그렇게',
        // 접속사
        '근데', '그런데', '그리고', '그래서', '그러면', '그러나', '하지만',
        // 구어체 부사
        '그냥', '좀', '걍', '막',
        // 감탄사
        '아니', '아', '오', '우와', '헐', '와', '어', '음',
        // 지시어
        '이거', '저거', '그거', '요거', '여기', '저기', '거기',
        // 시간 일반어
        '오늘', '내일', '어제', '지금', '이제', '나중', '다시', '또',
        // 기타 일반어
        '있다', '없다', '되다', '하다', '이유', '때문', '사람', '거', '것',
        '뭐', '왜', '어떻게', '언제', '누구', '얼마',
        // 이모티콘 표현
        'ㅋㅋ', 'ㄷㄷ', 'ㅠㅠ', 'ㅎㅎ', 'ㅇㅇ',
        // 문법 접두사
        '단독', '속보', '공식', '사진', '영상', '동영상',
    ])
    
    const tokens = tokenize(title)
        .map(w => w.toLowerCase().trim())
        .filter(w => {
            // 2글자 이상만
            if (w.length < 2) return false
            
            // 불용어 제외
            if (STOPWORDS.has(w)) return false
            
            // 순수 한글 자모만 있는 경우 제외 (ㅋㅋ, ㄷㄷ 등)
            if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w)) return false
            
            // 숫자만 있는 경우 제외
            if (/^\d+$/.test(w)) return false
            
            return true
        })
    
    return tokens
}

/**
 * simpleInferCategory - 간단한 키워드 기반 카테고리 분류
 * (더 이상 사용하지 않음 - verifyIssueByAI의 category 사용)
 */
function simpleInferCategory(title: string): IssueCategory {
    const titleLower = title.toLowerCase()
    const categories = getCategoryIds()
    
    let bestCategory: IssueCategory = '사회'
    let bestScore = 0
    
    for (const categoryId of categories) {
        const keywords = getCategoryKeywords(categoryId)
        let score = 0
        
        for (const keyword of keywords) {
            if (titleLower.includes(keyword.toLowerCase())) {
                score++
            }
        }
        
        if (score > bestScore) {
            bestScore = score
            bestCategory = categoryId as IssueCategory
        }
    }
    
    return bestCategory
}

/**
 * classifyTimelineStages - Groq으로 타임라인 기사 단계 분류
 *
 * 첫 번째 기사 = '발단', 마지막 기사 = 이슈 상태에 따라 '진정'/'전개'
 * 중간 기사들만 Groq 배치 요청으로 '전개'/'파생' 분류.
 * 중간이 2개 이하이거나 Groq 실패 시 전부 '전개'로 fallback.
 */
async function classifyTimelineStages(
    issueTitle: string,
    news: Array<{ id: string; title: string }>,
    issueStatus: string,
): Promise<Map<string, '발단' | '전개' | '파생' | '진정'>> {
    const result = new Map<string, '발단' | '전개' | '파생' | '진정'>()

    if (news.length === 0) return result

    // 기사 1개: 발단만
    result.set(news[0].id, '발단')
    if (news.length === 1) return result

    // 마지막: 종결이면 진정, 아니면 전개
    const lastStage = issueStatus === '종결' ? '진정' : '전개'
    result.set(news[news.length - 1].id, lastStage)

    // 중간 기사 없으면 끝
    const middle = news.slice(1, -1)
    if (middle.length === 0) return result

    // 중간 2개 이하: Groq 호출 없이 전개 배정
    if (middle.length <= 2) {
        middle.forEach(n => result.set(n.id, '전개'))
        return result
    }

    // Groq 배치 요청으로 전개/파생 분류
    try {
        const listText = middle.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
        const prompt = `다음은 한국 이슈와 관련 기사 목록입니다.

이슈 제목: ${issueTitle}

아래 기사들을 각각 "전개" 또는 "파생"으로 분류해주세요.
- 전개: 이슈의 직접적인 발전 (입장 발표, 후속 조치, 사건 확대 등)
- 파생: 이슈로 인해 새로 불거진 별개의 논란 (새 인물 등장, 연관 사건 등)

기사 목록:
${listText}

반드시 아래 JSON 형식으로만 답하세요:
[{"index":1,"stage":"전개"},{"index":2,"stage":"파생"}]`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 300 },
        )

        const parsed = parseJsonArray<{ index: number; stage: string }>(content)
        if (parsed) {
            parsed.forEach(item => {
                const target = middle[item.index - 1]
                if (target && (item.stage === '전개' || item.stage === '파생')) {
                    result.set(target.id, item.stage)
                }
            })
        }
    } catch (error) {
        console.warn('  ⚠️ [타임라인 단계 분류 실패] 전개로 fallback:', error)
    }

    // 분류 누락된 중간 기사 → 전개 fallback
    middle.forEach(n => { if (!result.has(n.id)) result.set(n.id, '전개') })

    return result
}

/**
 * filterAndTitleByAI - 뉴스 필터링 + 커뮤니티 필터링 + 제목 생성 통합
 *
 * AI 호출을 3개에서 1개로 줄여 Rate Limit 문제 해결
 */
async function filterAndTitleByAI(
    keyword: string,
    tentativeTitle: string,
    newsItems: Array<{ id: string; title: string; link: string; source: string; published_at: string }>,
    communityPosts: Array<{ id: string; title: string; source_site: string; created_at: string }>
): Promise<{
    finalIssueTitle: string
    relevantNewsIds: string[]
    relevantCommunityIds: string[]
}> {
    // Rate Limit 체크
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A 필터링+제목' })) {
        console.log('  ⚠️  [Rate Limit] 모든 키 차단됨, 크론 중단')
        throw new AllKeysRateLimitedError()
    }

    const newsTitlesText = newsItems.slice(0, 20).map((n, i) => `뉴스${i + 1}. ${n.title}`).join('\n')
    const postTitlesText = communityPosts.slice(0, 20).map((p, i) => `커뮤니티${i + 1}. ${p.title}`).join('\n')

    const prompt = `키워드와 관련된 뉴스/커뮤니티 글을 선별하고, 최종 이슈 제목을 생성하세요.

키워드: "${keyword}"
임시 제목: "${tentativeTitle}"

[뉴스 목록] (${newsItems.length}건):
${newsTitlesText}

[커뮤니티 글 목록] (${communityPosts.length}건):
${postTitlesText}

## 작업 1: 관련 뉴스 선별
키워드/임시 제목과 직접 관련된 뉴스만 선택 (무관한 뉴스 제외)
예시:
- "WBC 한국" → "WBC 이탈리아 경기" (X), "한국 8강 확정" (O)
- "왕사남" → "왕과 사는 남자 영화" (O), "왕실 관련 뉴스" (X)

## 작업 2: 최종 이슈 제목 생성
선별된 뉴스 제목들의 공통 핵심 내용으로 이슈 제목 작성
- 8~15자, 사실 중심, 구체적 표현
- 금지 표현: "화제", "논란", "충격", "대박", "관련 논의"
- 좋은 예: "WBC 한국 8강 진출", "최태원 이혼 소송", "지수 연기력 평가"
- 나쁜 예: "WBC 관련 논란", "최태원 화제", "지수 충격"

## 작업 3: 관련 커뮤니티 글 선별
이슈와 관련된 커뮤니티 글만 선택
- 포함: 직접 관련 글, 반응글, 의견글, 정보 공유
- 제외: 완전히 다른 주제, 스팸, 광고
- 불확실하면 포함 (관대하게)

응답 형식 (JSON만):
{
  "finalIssueTitle": "최종 이슈 제목",
  "relevantNewsNumbers": [1, 3, 5],
  "relevantCommunityNumbers": [1, 2, 4, 7]
}

※ 뉴스 번호와 커뮤니티 번호는 각각 1부터 시작하는 별도 번호`

    const MAX_ATTEMPTS = 2

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const content = await callGroq(
                [{ role: 'user', content: prompt }],
                {
                    model: 'claude-sonnet-4-6',
                    temperature: 0.2,
                    max_tokens: 500,
                }
            )

            recordRateLimitSuccess()

            const result = parseJsonObject<{
                finalIssueTitle: string
                relevantNewsNumbers: number[]
                relevantCommunityNumbers: number[]
            }>(content)

            if (!result) {
                // JSON 파싱 실패 → 기술적 실패이므로 재시도
                console.warn(`  ⚠️ [JSON 파싱 실패] AI 응답: ${content?.substring(0, 200)} (시도 ${attempt}/${MAX_ATTEMPTS})`)
                if (attempt < MAX_ATTEMPTS) continue
                // 최종 실패 → 필터링 불가로 빈 배열 반환 (무관한 뉴스 연결 방지)
                return {
                    finalIssueTitle: tentativeTitle,
                    relevantNewsIds: [],
                    relevantCommunityIds: [],
                }
            }

            // 번호 → ID 변환
            const relevantNewsIds = (result.relevantNewsNumbers || [])
                .filter(n => n >= 1 && n <= newsItems.length)
                .map(n => newsItems[n - 1].id)

            const relevantCommunityIds = (result.relevantCommunityNumbers || [])
                .filter(n => n >= 1 && n <= communityPosts.length)
                .map(n => communityPosts[n - 1].id)

            // AI가 명시적으로 선별한 뉴스만 사용 (빈 배열이면 관련 뉴스 없음으로 처리)
            const finalNewsIds = relevantNewsIds
            const finalTitle = result.finalIssueTitle || tentativeTitle

            console.log(`  ✓ [뉴스 필터링] ${finalNewsIds.length}/${newsItems.length}건 선별`)
            console.log(`  ✓ [커뮤니티 필터링] ${relevantCommunityIds.length}/${communityPosts.length}건 선별`)
            console.log(`  ✓ [최종 제목] "${finalTitle}"`)

            return {
                finalIssueTitle: finalTitle,
                relevantNewsIds: finalNewsIds,
                relevantCommunityIds,
            }

        } catch (error) {
            const isRateLimit = error instanceof Error && error.message.includes('Rate Limit')
            if (isRateLimit) recordRateLimitFailure()

            // Rate Limit은 재시도해도 의미 없으므로 즉시 폴백 (필터링 불가로 빈 배열 반환)
            if (isRateLimit || attempt >= MAX_ATTEMPTS) {
                console.error(`[AI 필터링+제목 생성 에러] (시도 ${attempt}/${MAX_ATTEMPTS})`, error)
                return {
                    finalIssueTitle: tentativeTitle,
                    relevantNewsIds: [],
                    relevantCommunityIds: [],
                }
            }

            console.warn(`  ⚠️ [AI 호출 에러] 재시도 ${attempt}/${MAX_ATTEMPTS}...`, error)
        }
    }

    // 루프 정상 종료 불가 경로 (타입 안전을 위한 폴백, 필터링 불가)
    return {
        finalIssueTitle: tentativeTitle,
        relevantNewsIds: [],
        relevantCommunityIds: [],
    }
}

/**
 * filterRelevantCommunityPosts - AI로 이슈 제목과 관련된 커뮤니티 글만 필터링
 * 
 * ⚠️ 더 이상 사용하지 않음 - filterAndTitleByAI에 통합됨
 * 
 * 개선: 완화된 기준으로 관련성 판단 (반응글도 포함)
 */
/*
async function filterRelevantCommunityPosts(
    issueTitle: string,
    posts: Array<{ id: string; title: string; source_site: string; created_at: string }>
): Promise<string[]> {
    // Rate Limit 체크
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A 커뮤니티 필터링' })) {
        console.log('  ⚠️  [Rate Limit] 모든 키 차단됨, 크론 중단')
        throw new AllKeysRateLimitedError()
    }
    
    try {
        const postTitlesText = posts.slice(0, 20).map((p, i) => `${i + 1}. ${p.title}`).join('\n')
        
        const prompt = `이슈 제목과 관련된 커뮤니티 글을 선별하세요.

이슈 제목: "${issueTitle}"

커뮤니티 글 제목 (${posts.length}건):
${postTitlesText}

## 판단 기준 (완화됨)

### ✅ 관련 글 (선택) - 넓게 포함
- 이슈 제목의 **주요 키워드**가 포함된 글
- 이슈에 대한 **반응, 의견, 감상** 글도 포함
- 직접적으로 다루지 않아도 **맥락상 관련**되면 포함
- 예: "WBC 한국 8강" → "WBC 개꿀잼" (O - 반응글)
- 예: "WBC 한국 8강" → "진짜 대박이다" (O - 문맥상 WBC 관련)
- 예: "최태원 이혼" → "최태원 근황" (O - 동일 인물)

### ❌ 무관한 글 (제외) - 명확히 다른 주제만
- 이슈 제목과 **완전히 다른 주제**를 다루는 글
- 주요 키워드가 **전혀 없고** 맥락도 다른 글
- 예: "WBC 한국 8강" → "손흥민 골" (X - 완전히 다른 스포츠)
- 예: "WBC 한국 8강" → "날씨 좋다" (X - 완전히 다른 주제)
- 예: "최태원 이혼" → "삼성 실적" (X - 다른 재벌 관련)

**중요: 불확실하면 포함하세요. 커뮤니티 반응도 이슈의 일부입니다.**

응답 형식 (JSON만):
{
  "relevantPostIds": [1, 3, 5],
  "reason": "선별 이유 (한 줄)"
}

참고: postIds는 위 리스트의 번호 (1부터 시작)`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'claude-sonnet-4-6',
                temperature: 0.1,
                max_tokens: 300,
            }
        )
        
        const result = parseJsonObject<{ relevantPostIds: number[]; reason: string }>(content)
        if (!result || !result.relevantPostIds || !Array.isArray(result.relevantPostIds)) {
            console.log(`  ⚠️  [커뮤니티 필터링 실패] AI 응답 파싱 실패 - 전체 글 사용`)
            return posts.map(p => p.id)
        }
        
        const selectedIds = result.relevantPostIds
            .filter(idx => idx >= 1 && idx <= posts.length)
            .map(idx => posts[idx - 1].id)
        
        console.log(`  ✓ [커뮤니티 필터링] ${selectedIds.length}/${posts.length}건 선별 - ${result.reason}`)
        
        return selectedIds
        
    } catch (error) {
        console.error('[커뮤니티 필터링 에러]', error)
        return posts.map(p => p.id)  // 에러 시 전체 반환 (안전장치)
    }
}
*/

/**
 * filterRelevantNews - AI로 커뮤니티 키워드와 관련된 뉴스만 필터링
 * 
 * ⚠️ 더 이상 사용하지 않음 - filterAndTitleByAI에 통합됨
 * 
 * 문제: "이탈리아" 검색 시 무관한 "이탈리아 정부", "이탈리아 여행" 등 모두 검색됨
 * 해결: AI로 커뮤니티 키워드와 실제 관련된 뉴스만 선별
 */
/*
async function filterRelevantNews(
    keyword: string,
    newsItems: Array<{ id: string; title: string; link: string; source: string; published_at: string }>
): Promise<string[]> {
    // Rate Limit 체크
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A 뉴스 필터링' })) {
        console.log('  ⚠️  [Rate Limit] 모든 키 차단됨, 크론 중단')
        throw new AllKeysRateLimitedError()
    }
    
    try {
        const newsTitlesText = newsItems.slice(0, 20).map((n, i) => `${i + 1}. ${n.title}`).join('\n')
        
        const prompt = `커뮤니티에서 급증한 키워드와 관련된 뉴스만 선별하세요.

커뮤니티 키워드: "${keyword}"

검색된 뉴스 제목 (${newsItems.length}건):
${newsTitlesText}

## 판단 기준

### ✅ 관련 뉴스 (선택)
- 키워드와 **직접적으로** 관련된 뉴스
- 키워드가 핵심 주제인 뉴스
- 예: "이탈리아" + "WBC" → "WBC 이탈리아 8강" (O)

### ❌ 무관한 뉴스 (제외)
- 키워드가 단순히 언급만 된 뉴스
- 다른 주제를 다루는 뉴스
- 예: "이탈리아" + "WBC" → "이탈리아 정부 발표" (X)
- 예: "이탈리아" + "WBC" → "이탈리아 여행" (X)
- 예: "WBC" → "WBC 미국 경기" (한국이 키워드인데 미국만 다룬 경우 X)

응답 형식 (JSON만):
{
  "relevantNewsIds": [1, 3, 5, 7],
  "reason": "선별 이유 (한 줄)"
}

참고: newsIds는 위 리스트의 번호 (1부터 시작)`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'claude-sonnet-4-6',
                temperature: 0.1,
                max_tokens: 300,
            }
        )
        
        const result = parseJsonObject<{ relevantNewsIds: number[]; reason: string }>(content)
        if (!result || !result.relevantNewsIds || !Array.isArray(result.relevantNewsIds)) {
            console.log(`  ⚠️  [뉴스 필터링 실패] AI 응답 파싱 실패 - 전체 뉴스 사용`)
            return newsItems.map(n => n.id)
        }
        
        const selectedIds = result.relevantNewsIds
            .filter(idx => idx >= 1 && idx <= newsItems.length)
            .map(idx => newsItems[idx - 1].id)
        
        console.log(`  ✓ [뉴스 필터링] ${selectedIds.length}/${newsItems.length}건 선별 - ${result.reason}`)
        
        return selectedIds
        
    } catch (error) {
        console.error('[뉴스 필터링 에러]', error)
        return newsItems.map(n => n.id)
    }
}
*/

/**
 * generateIssueTitleFromNews - 실제 뉴스 제목을 분석하여 이슈 제목 생성
 * 
 * ⚠️ 더 이상 사용하지 않음 - filterAndTitleByAI에 통합됨
 * 
 * 장점: 실제 뉴스 내용 기반, 팩트 체크됨, 정확함
 */
/*
async function generateIssueTitleFromNews(
    keyword: string,
    newsTitles: string[],
    postCount: number
): Promise<{ issueTitle: string }> {
    // Rate Limit 체크
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A 제목 생성' })) {
        console.log('  ⚠️  [Rate Limit] 모든 키 차단됨, 크론 중단')
        throw new AllKeysRateLimitedError()
    }
    
    try {
        const newsTitlesText = newsTitles.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n')
        
        const prompt = `커뮤니티에서 급증한 키워드와 실제 검색된 뉴스 제목들을 분석하여, 정확하고 간결한 이슈 제목을 생성하세요.

키워드: "${keyword}"
커뮤니티 급증: ${postCount}건

실제 뉴스 제목 (최근순):
${newsTitlesText}

## 제목 생성 원칙

1. **뉴스 제목들의 공통 주제 파악**
   - 여러 뉴스가 공통적으로 다루는 핵심 내용 찾기
   - 가장 중요하고 구체적인 사실 중심

2. **구체적이고 명확하게**
   - 뉴스에서 확인된 사실만 사용
   - 숫자, 이름, 결과 등이 있으면 포함
   - 예: "8강 확정", "1200만 돌파", "선수 합류"

3. **중립적으로 표현**
   - ❌ 금지: "화제", "논란", "충격", "대박"
   - ✅ 허용: 사실적 표현 (확정, 돌파, 개봉, 경기)

4. **간결하게 (8~15자)**
   - 핵심만 담아서 명확하게

### 예시

뉴스: "한국, WBC 8강 확정", "WBC 한국 도미니카와 맞대결"
→ 제목: "WBC 한국 8강 확정" ✅

뉴스: "왕과 사는 남자 1200만", "왕사남 역대 5위 흥행"
→ 제목: "왕과 사는 남자 1200만 돌파" ✅

뉴스: "손흥민 2골", "손흥민 시즌 15호골 폭발"
→ 제목: "손흥민 멀티골" ✅

응답 형식 (JSON만):
{
  "issueTitle": "생성된 이슈 제목"
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'claude-sonnet-4-6',
                temperature: 0.2,
                max_tokens: 200,
            }
        )
        
        const result = parseJsonObject<{ issueTitle: string }>(content)
        if (!result || !result.issueTitle) {
            return { issueTitle: `${keyword} 소식` }
        }
        
        return { issueTitle: result.issueTitle }
        
    } catch (error) {
        console.error('[이슈 제목 생성 에러]', error)
        return { issueTitle: `${keyword} 소식` }
    }
}
*/

/**
 * samplePostTitles - 출처별로 다양한 게시글 제목 샘플 추출
 *
 * source_site가 다른 글을 우선 선택해 편향 방지.
 * 최대 n개 반환.
 */
function samplePostTitles(
    posts: Array<{ title: string; source_site: string }>,
    n = 3
): string[] {
    const seen = new Set<string>()
    const sampled: string[] = []

    // 1순위: source_site 다양성 확보
    for (const post of posts) {
        if (sampled.length >= n) break
        if (!seen.has(post.source_site)) {
            seen.add(post.source_site)
            sampled.push(post.title)
        }
    }

    // 2순위: 부족하면 나머지에서 추가
    for (const post of posts) {
        if (sampled.length >= n) break
        if (!sampled.includes(post.title)) {
            sampled.push(post.title)
        }
    }

    return sampled
}

/**
 * verifyIssueByAI - AI로 이슈 여부 및 검색 키워드 추출
 */
async function verifyIssueByAI(
    keyword: string,
    postCount: number,
    sourceSites: string[],
    sampleTitles: string[]
): Promise<AIVerificationResult> {
    // Rate Limit 상태 체크 (Critical 우선순위)
    if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A 이슈 검증' })) {
        console.log('  ⚠️  [Rate Limit] 모든 키 차단됨, 크론 중단')
        throw new AllKeysRateLimitedError()
    }
    
    try {
        const sourceSitesText = sourceSites.join(', ')
        const sampleTitlesText = sampleTitles.map((t, i) => `  ${i + 1}. "${t}"`).join('\n')

        const prompt = `커뮤니티에서 급증한 키워드가 뉴스 이슈가 될 만한지 판단하고, 카테고리, 임시 제목, 검색 키워드를 생성하세요.

키워드: "${keyword}"
급증 정보:
- 게시글 수: ${postCount}건
- 출처: ${sourceSitesText}
- 게시글 제목 샘플:
${sampleTitlesText}

## 1단계: 키워드 맥락 파악
- 키워드의 정확한 의미 파악
- 줄임말이면 원래 표현 추론 (예: "왕사남" → "왕과 사는 남자")
- 고유명사인지, 일반 단어인지 구분

## 2단계: 이슈 판단
- ✅ 이슈: 사회적 논란, 연예 뉴스, 정치 이슈, 스포츠 경기, 사건사고, 화제작
- ❌ 이슈 아님: 단순 유행어/밈, 스팸/홍보, 의미 없는 반응글, 일상 대화

## 3단계: 카테고리 분류 (정확히 판단)
다음 중 하나 선택:
- "사회": 사건사고, 법원 판결, 복지, 교육, 사회 이슈, 생활, 여행, 음식, 건강
- "정치": 정치인, 정부 정책, 국회, 선거, 외교
- "연예": 연예인, 아이돌, 드라마, 영화, 음악, 방송
- "스포츠": 스포츠 경기, 선수, 대회, 올림픽, 월드컵
- "경제": 기업, 주식, 부동산, 금융, 경제 정책
- "기술": IT, 과학, 게임, AI, 스타트업, 반도체, 연구
- "세계": 국제 뉴스, 외국 사건, 해외 이슈

⚠️ 카테고리 판단 우선순위:
1. 스포츠 관련 (경기, 선수) → "스포츠" (예: WBC는 스포츠)
2. 기업 비즈니스 관련 → "경제" (예: 두끼 마케팅은 경제)
3. 연예인/드라마/영화 → "연예"
4. 사건사고/법원/교육/생활/문화 → "사회"
5. 정치인/정책 → "정치"
6. IT/과학/기술/연구 → "기술"
7. 불명확하면 → "사회"

## 4단계: 임시 제목 생성
키워드 기반 임시 이슈 제목 (8~15자)
- 금지: "~논란", "~화제", "~충격" 같은 모호한 표현
- 사실적 표현 사용 (예: "WBC 한국 경기", "최태원 이혼 소송")

## 5단계: 검색 키워드 생성 (중요!)
뉴스 매칭률을 최대화하는 키워드
- 줄임말은 원래 표현으로 풀어서 사용
- 영화/드라마: 정식 제목 사용
- 인물: 풀네임 사용
- 스포츠: 팀명 + 상대팀명 조합 (예: "WBC 한국 이탈리아")
- 너무 포괄적인 키워드는 피하기 (예: "WBC 야구" X → "WBC 한국" O)

응답 형식 (JSON만):
{
  "isIssue": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)",
  "category": "연예",
  "tentativeTitle": "임시 이슈 제목",
  "searchKeyword": "네이버 뉴스 검색용 키워드"
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'claude-sonnet-4-6',
                temperature: 0.2,
                max_tokens: 500,
            }
        )
        
        // 성공 기록
        recordRateLimitSuccess()
        
        const result = parseJsonObject<AIVerificationResult>(content)
        if (!result) {
            console.error('  ✗ [JSON 파싱 실패] AI 응답:', content?.substring(0, 200))
            return { 
                isIssue: false, 
                confidence: 0, 
                reason: 'JSON 파싱 실패',
                searchKeyword: '',
                category: '사회',
                tentativeTitle: ''
            }
        }
        
        // confidence와 reason이 undefined인 경우 처리
        if (typeof result.confidence !== 'number' || !result.reason) {
            console.error('  ✗ [AI 응답 불완전]', result)
            return { 
                isIssue: false, 
                confidence: 0, 
                reason: 'AI 응답 불완전',
                searchKeyword: '',
                category: '사회',
                tentativeTitle: ''
            }
        }
        
        // category 유효성 검사
        const validCategories: IssueCategory[] = ['사회', '정치', '연예', '스포츠', '경제', '기술', '세계']
        const category = validCategories.includes(result.category) ? result.category : '사회'
        
        return {
            isIssue: result.isIssue && result.confidence >= 70,
            confidence: result.confidence,
            reason: result.reason,
            searchKeyword: result.searchKeyword || keyword,
            category,
            tentativeTitle: result.tentativeTitle || keyword,
        }
        
    } catch (error) {
        console.error('[AI 이슈 검증 에러]', error)
        
        // Rate Limit 실패 기록
        if (error instanceof Error && error.message.includes('Rate Limit')) {
            recordRateLimitFailure()
        }
        
        return { 
            isIssue: false, 
            confidence: 0, 
            reason: `에러: ${error}`,
            searchKeyword: '',
            category: '사회',
            tentativeTitle: ''
        }
    }
}

/**
 * processTrackA - 트랙 A 메인 로직
 */
async function processTrackA(): Promise<{ 
    success: number
    failed: number
    earlyExit?: boolean
    reason?: string
}> {
    console.log(`[트랙 A] 시작 (최근 ${WINDOW_MINUTES}분, 임계값: ${BURST_THRESHOLD}건)`)
    
    const cutoffTime = new Date(
        Date.now() - WINDOW_MINUTES * 60 * 1000
    ).toISOString()
    
    // 1단계: 최근 커뮤니티 수집 건 조회
    const { data: recentPosts, error } = await supabaseAdmin
        .from('community_data')
        .select('id, title, created_at, source_site')
        .gte('updated_at', cutoffTime)
        .is('issue_id', null)
        .order('updated_at', { ascending: false })
    
    if (error || !recentPosts || recentPosts.length === 0) {
        console.log('[트랙 A] 최근 게시글 없음')
        return { success: 0, failed: 0 }
    }
    
    console.log(`  • 최근 ${WINDOW_MINUTES}분간 ${recentPosts.length}건 수집`)
    
    // 2단계: 키워드 추출 및 빈도 계산
    const keywordMap = new Map<string, Array<{ id: string; title: string; created_at: string; source_site: string }>>()
    
    for (const post of recentPosts) {
        const keywords = extractCommunityKeywords(post.title)
        for (const kw of keywords) {
            if (!keywordMap.has(kw)) {
                keywordMap.set(kw, [])
            }
            keywordMap.get(kw)!.push(post)
        }
    }
    
    // 3단계: 급증 키워드 필터링 (2차 방어선)
    const burstKeywords: KeywordBurst[] = []
    const EXCLUDED_KEYWORDS = [
        // 파일 확장자
        'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webp', 'pdf',
        // 감탄사/이모티콘
        'ㅋㅋ', 'ㄷㄷ', 'ㅠㅠ', 'ㅎㅎ', 'ㅇㅇ',
        // 추가 불용어 (키워드 추출에서 걸러지지 않은 경우 대비)
        '[단독]', '[속보]', '[공식]', '[사진]',
    ]
    
    for (const [keyword, posts] of keywordMap) {
        // 의미 없는 키워드 제외
        const normalizedKeyword = keyword.toLowerCase().trim()
        if (EXCLUDED_KEYWORDS.some(ex => normalizedKeyword.includes(ex.toLowerCase())) || keyword.length < 2) {
            continue
        }
        
        if (posts.length >= BURST_THRESHOLD) {
            burstKeywords.push({ keyword, count: posts.length, posts })
        }
    }
    
    if (burstKeywords.length === 0) {
        console.log('[트랙 A] 급증 키워드 없음')
        return { success: 0, failed: 0 }
    }
    
    burstKeywords.sort((a, b) => b.count - a.count)
    
    console.log(`  • 급증 키워드 ${burstKeywords.length}개 발견:`)
    for (const burst of burstKeywords.slice(0, 5)) {
        console.log(`    - "${burst.keyword}": ${burst.count}건`)
    }
    
    let successCount = 0
    let failedCount = 0

    // track_a_logs 헬퍼: 키워드 처리 결과를 DB에 저장
    async function logTrackA(
        keyword: string,
        burstCount: number,
        result: string,
        details?: Record<string, unknown>,
        issueId?: string,
    ) {
        await supabaseAdmin.from('track_a_logs').insert({
            keyword,
            burst_count: burstCount,
            result,
            issue_id: issueId ?? null,
            details: details ?? null,
        }).then(({ error }) => {
            if (error) console.error('[track_a_logs 저장 실패]', error.message)
        })
    }

    // 4단계: 상위 N개 키워드 처리 (Rate Limit 완화)
    try {
        const keywordsToProcess = burstKeywords.slice(0, MAX_KEYWORDS_PER_RUN)
        console.log(`  • 처리 예정: ${keywordsToProcess.length}개 키워드 (최대: ${MAX_KEYWORDS_PER_RUN}개)`)

        for (const burst of keywordsToProcess) {
            console.log(`\n[키워드 검증] "${burst.keyword}" (${burst.count}건)`)

            try {
                // 4-1. AI 이슈 검증 및 검색 키워드 추출
                const sourceSites = [...new Set(burst.posts.map(p => p.source_site))]
                const sampleTitles = samplePostTitles(burst.posts)
                const aiResult = await verifyIssueByAI(burst.keyword, burst.count, sourceSites, sampleTitles)

        if (!aiResult.isIssue) {
            console.log(`  ✗ [AI 검증 실패] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
            await logTrackA(burst.keyword, burst.count, 'ai_rejected', {
                confidence: aiResult.confidence,
                reason: aiResult.reason,
                sources: sourceSites,
            })
            failedCount++
            continue
        }
        
        console.log(`  ✓ [AI 검증 통과] 신뢰도 ${aiResult.confidence}%`)
        console.log(`  카테고리: ${aiResult.category}`)
        console.log(`  임시 제목: "${aiResult.tentativeTitle}"`)
        console.log(`  검색 키워드: "${aiResult.searchKeyword}"`)
        
        const category = aiResult.category
        const tentativeTitle = aiResult.tentativeTitle
        
        // 4-2. 네이버 뉴스 즉시 타겟 검색 (카테고리 전달)
        const newsItems = await searchNaverNewsByKeyword(aiResult.searchKeyword, category)
        
        if (newsItems.length === 0) {
            console.log(`  ✗ [뉴스 없음] 네이버 뉴스 0건 - 루머 가능성`)
            await logTrackA(burst.keyword, burst.count, 'no_news', {
                searchKeyword: aiResult.searchKeyword,
                category: aiResult.category,
                aiConfidence: aiResult.confidence,
            })
            failedCount++
            continue
        }
        
        console.log(`  ✓ [뉴스 발견] 네이버 뉴스 ${newsItems.length}건`)
        
        // 4-3. 중복 체크 (tentativeTitle 사용)
        const duplicateCheck = await checkDuplicateIssue(supabaseAdmin, tentativeTitle)
        
        if (duplicateCheck.isDuplicate) {
            console.log(`  ✗ [중복 이슈] "${duplicateCheck.existingIssue?.title}"`)

            // 기존 이슈에 커뮤니티 글 + 뉴스 연결 (AI 필터링 적용 — 오매칭 방지)
            try {
                const { relevantCommunityIds: filteredCommunityIds, relevantNewsIds: filteredNewsIds } = await filterAndTitleByAI(
                    burst.keyword,
                    duplicateCheck.existingIssue!.title,
                    newsItems,
                    burst.posts,
                )

                if (filteredCommunityIds.length > 0) {
                    await supabaseAdmin
                        .from('community_data')
                        .update({ issue_id: duplicateCheck.existingIssue!.id })
                        .in('id', filteredCommunityIds)
                    console.log(`  → 기존 이슈에 커뮤니티 ${filteredCommunityIds.length}/${burst.posts.length}건 추가 연결`)
                } else {
                    console.log(`  → 관련 커뮤니티 글 없음 (필터링 후 0건) — 연결 건너뜀`)
                }

                if (filteredNewsIds.length > 0) {
                    await supabaseAdmin
                        .from('news_data')
                        .update({ issue_id: duplicateCheck.existingIssue!.id })
                        .in('id', filteredNewsIds)
                        .is('issue_id', null) // 이미 다른 이슈에 연결된 뉴스는 건드리지 않음
                    console.log(`  → 기존 이슈에 뉴스 ${filteredNewsIds.length}/${newsItems.length}건 추가 연결`)
                }
            } catch {
                // AI 실패 시 폴백: 커뮤니티만 전체 연결 (뉴스는 연결 안 함 — 노이즈 방지)
                const postIds = burst.posts.map(p => p.id)
                await supabaseAdmin
                    .from('community_data')
                    .update({ issue_id: duplicateCheck.existingIssue!.id })
                    .in('id', postIds)
                console.log(`  → [폴백] 기존 이슈에 커뮤니티 ${postIds.length}건 추가 연결 (뉴스 연결 건너뜀)`)
            }

            await logTrackA(burst.keyword, burst.count, 'duplicate_linked', {
                existingIssueId: duplicateCheck.existingIssue?.id,
                existingIssueTitle: duplicateCheck.existingIssue?.title,
                newsCount: newsItems.length,
            })
            failedCount++
            continue
        }

        // 4-4. AI 통합 작업: 뉴스 필터링 + 커뮤니티 필터링 + 최종 제목 생성
        const { finalIssueTitle, relevantNewsIds, relevantCommunityIds } = await filterAndTitleByAI(
            burst.keyword,
            tentativeTitle,
            newsItems,
            burst.posts
        )
        
        // 커뮤니티 글이 하나도 없으면 이슈 생성 건너뛰기
        if (relevantCommunityIds.length === 0) {
            console.log(`  ✗ [커뮤니티 필터링] 관련 글 없음 - 이슈 생성 건너뛰기`)
            await logTrackA(burst.keyword, burst.count, 'no_community', {
                tentativeTitle,
                newsCount: newsItems.length,
                communityBeforeFilter: burst.posts.length,
            })
            failedCount++
            continue
        }
        
        // 트랙A 검증
        const trackAValidation = validateTrackAIssue(relevantCommunityIds.length)
        if (!trackAValidation.isValid) {
            console.error(`  ✗ [트랙A 검증 실패] ${trackAValidation.error}`)
            await logTrackA(burst.keyword, burst.count, 'validation_failed', {
                error: trackAValidation.error,
                communityCount: relevantCommunityIds.length,
            })
            failedCount++
            continue
        }
        
        console.log(`  최종 제목: "${finalIssueTitle}"`)
        
        // 이슈 생성 데이터 검증
        const issueValidation = validateIssueCreation({
            title: finalIssueTitle,
            category,
            source_track: 'track_a',  // 명시적으로 지정
            approval_status: '대기',
            status: '점화',
        })
        
        if (!issueValidation.isValid) {
            console.error(`  ✗ [이슈 검증 실패] ${issueValidation.error}`)
            await logTrackA(burst.keyword, burst.count, 'validation_failed', {
                error: issueValidation.error,
                finalIssueTitle,
            })
            failedCount++
            continue
        }
        
        // 4-5. 이슈 후보 등록 (검증된 데이터 사용)
        const { data: newIssue, error: createError } = await supabaseAdmin
            .from('issues')
            .insert(issueValidation.validated!)
            .select('id')
            .single()
        
        if (createError || !newIssue) {
            console.error('[이슈 생성 에러]', createError)
            failedCount++
            continue
        }
        
        // 4-6. 커뮤니티 글 연결 (이미 필터링됨)
        await supabaseAdmin
            .from('community_data')
            .update({ issue_id: newIssue.id })
            .in('id', relevantCommunityIds)
        
        console.log(`  ✓ [커뮤니티 연결] ${relevantCommunityIds.length}건 연결 완료`)
        
        // 4-7. 뉴스 연결 (필터링된 관련 뉴스만)
        const relevantNews = newsItems.filter(n => relevantNewsIds.includes(n.id))
        const { data: linkedNews } = await supabaseAdmin
            .from('news_data')
            .update({ issue_id: newIssue.id })
            .in('id', relevantNewsIds)
            .is('issue_id', null)
            .select('id')
        
        const linkedNewsCount = linkedNews?.length ?? 0
        console.log(`  ✓ [뉴스 연결] ${linkedNewsCount}/${relevantNews.length}건 연결 완료 (필터링: ${newsItems.length}→${relevantNews.length})`)
        
        // 연결된 뉴스가 하나도 없으면 이슈 삭제
        if (linkedNewsCount === 0) {
            console.log(`  ❌ [뉴스 연결 실패] 모든 뉴스가 다른 이슈에 이미 연결됨 - 이슈 삭제`)
            await cleanupOrphanedRecords(newIssue.id)
            await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
            await logTrackA(burst.keyword, burst.count, 'no_news_linked', {
                finalIssueTitle,
                newsFiltered: relevantNewsIds.length,
            })
            failedCount++
            continue
        }
        
        // 4-8. 타임라인 준비 (실제 연결된 뉴스 기준)
        console.log(`  → [타임라인 생성 시작] 연결된 뉴스 ${linkedNewsCount}건 기준`)
        
        let timelinePoints: Array<{
            issue_id: string
            title: string
            occurred_at: string
            source_url: string
            stage: '발단' | '전개' | '파생' | '진정'
        }> = []
        
        if (linkedNewsCount > 0) {
            const sortedNews = [...(linkedNews ?? [])].sort((a, b) => {
                const aTime = relevantNews.find(n => n.id === a.id)?.published_at ?? ''
                const bTime = relevantNews.find(n => n.id === b.id)?.published_at ?? ''
                return new Date(aTime).getTime() - new Date(bTime).getTime()
            })

            const sampledNews = sortedNews.slice(0, 5)
            const newsForClassify = sampledNews.map(news => {
                const item = relevantNews.find(n => n.id === news.id)
                return { id: news.id, title: item?.title ?? '' }
            })

            // Groq으로 단계 분류 (발단/전개/파생/진정)
            const stageMap = await classifyTimelineStages(
                finalIssueTitle,
                newsForClassify,
                '점화', // 신규 이슈는 항상 점화 상태
            )

            timelinePoints = sampledNews.map(news => {
                const newsItem = relevantNews.find(n => n.id === news.id)
                return {
                    issue_id: newIssue.id,
                    title: newsItem?.title ?? '',
                    occurred_at: newsItem?.published_at ?? new Date().toISOString(),
                    source_url: newsItem?.link ?? '',
                    stage: stageMap.get(news.id) ?? '전개',
                }
            })
        }
        
        // 타임라인이 없으면 이슈 삭제
        if (timelinePoints.length === 0) {
            console.log(`  ❌ [타임라인 없음] 뉴스 데이터가 부족하여 타임라인 생성 불가 - 이슈 삭제`)
            await cleanupOrphanedRecords(newIssue.id)
            await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
            await logTrackA(burst.keyword, burst.count, 'no_timeline', {
                finalIssueTitle,
                linkedNewsCount,
            })
            failedCount++
            continue
        }
        
        // 타임라인 생성 (필수)
        const { error: timelineError } = await supabaseAdmin
            .from('timeline_points')
            .insert(timelinePoints)
        
        if (timelineError) {
            console.error(`  ❌ [타임라인 생성 실패] ${timelineError.message}`)
            console.error(`     상세: ${timelineError.details || 'N/A'}`)
            await cleanupOrphanedRecords(newIssue.id)
            await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
            await logTrackA(burst.keyword, burst.count, 'no_timeline', {
                finalIssueTitle,
                error: timelineError.message,
            })
            failedCount++
            continue
        }
        
        console.log(`  ✓ [타임라인 생성 완료] ${timelinePoints.length}개 포인트`)
        
        // 4-9. 화력 계산
        const heatIndex = await calculateHeatIndex(newIssue.id).catch(() => 0)
        
        // 화력 15점 미만이면 이슈 삭제
        if (heatIndex < MIN_HEAT_TO_REGISTER) {
            console.log(`  ❌ [화력 부족] "${finalIssueTitle}" (화력: ${heatIndex}점, 최소: ${MIN_HEAT_TO_REGISTER}점) - 이슈 삭제`)
            await cleanupOrphanedRecords(newIssue.id)
            await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
            await logTrackA(burst.keyword, burst.count, 'heat_too_low', {
                finalIssueTitle,
                heatIndex,
                minHeat: MIN_HEAT_TO_REGISTER,
            })
            failedCount++
            continue
        }
        
        // 화력 기반 자동 승인 판단 (AUTO_APPROVE_CATEGORIES에 없는 카테고리는 수동 승인 필수)
        const shouldAutoApprove = heatIndex >= AUTO_APPROVE_HEAT_THRESHOLD && AUTO_APPROVE_CATEGORIES.includes(category)
        const requiresManualReview = !AUTO_APPROVE_CATEGORIES.includes(category)
        const approvalStatus = shouldAutoApprove ? '승인' : '대기'
        const now = new Date().toISOString()

        await supabaseAdmin
            .from('issues')
            .update({
                heat_index: heatIndex,
                created_heat_index: heatIndex,
                approval_status: approvalStatus,
                approval_type: shouldAutoApprove ? 'auto' : null,
                approved_at: shouldAutoApprove ? now : null,
            })
            .eq('id', newIssue.id)

        const statusLabel = shouldAutoApprove
            ? `자동승인 (화력 ${heatIndex}점 ≥ ${AUTO_APPROVE_HEAT_THRESHOLD}점)`
            : requiresManualReview && heatIndex >= AUTO_APPROVE_HEAT_THRESHOLD
                ? `수동승인 대기 (${category} 카테고리)`
                : '대기'
        console.log(`  ✅ [이슈 등록 완료] "${finalIssueTitle}" (ID: ${newIssue.id}, 화력: ${heatIndex}점, 상태: ${statusLabel})`)
        await logTrackA(
            burst.keyword,
            burst.count,
            shouldAutoApprove ? 'auto_approved' : 'issue_created',
            {
                finalIssueTitle,
                heatIndex,
                category,
                approvalStatus,
                newsLinked: linkedNewsCount,
                communityLinked: relevantCommunityIds.length,
            },
            newIssue.id,
        )

        // 연예/정치 + 화력 30 이상 → 관리자 즉시 Dooray 알림
        if (requiresManualReview && heatIndex >= AUTO_APPROVE_HEAT_THRESHOLD) {
            sendDoorayImmediateAlert({
                id: newIssue.id,
                title: finalIssueTitle,
                category,
                heat_index: heatIndex,
                created_at: now,
            }).catch(e => console.error('[Dooray 즉시 알림 실패]', e))
        }

        successCount++
        
        // Rate Limit 완화: AI 호출 간 충분한 대기
        if (keywordsToProcess.length > 1) {
            console.log(`  ⏳ Rate Limit 방지 대기 중... (${AI_CALL_DELAY_MS}ms)`)
            await new Promise(resolve => setTimeout(resolve, AI_CALL_DELAY_MS))
        }
            } catch (error) {
                // 개별 키워드 처리 중 에러 발생 시
                if (error instanceof AllKeysRateLimitedError) {
                    await logTrackA(burst.keyword, burst.count, 'rate_limited', {
                        error: String(error),
                    })
                    throw error
                }
                console.error(`  ❌ [처리 에러] ${error}`)
                await logTrackA(burst.keyword, burst.count, 'error', {
                    error: String(error),
                })
                failedCount++
            }
        }
    } catch (error) {
        // AllKeysRateLimitedError 캐치
        if (error instanceof AllKeysRateLimitedError) {
            console.error('\n[트랙 A] 🚨 모든 Groq API 키가 Rate Limit 상태입니다')
            console.error('[트랙 A] 크론 조기 종료 (다음 실행 시 재시도)')
            return { 
                success: successCount, 
                failed: failedCount,
                earlyExit: true,
                reason: 'rate_limit_all_keys'
            }
        }
        // 예상치 못한 에러는 다시 던짐
        throw error
    }
    
    console.log(`\n[트랙 A] 완료: 성공 ${successCount}개, 실패 ${failedCount}개`)
    return { success: successCount, failed: failedCount }
}

/**
 * POST /api/cron/track-a
 */
export async function GET(req: NextRequest) {
    if (!verifyCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    try {
        const result = await processTrackA()
        return NextResponse.json(result)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        
        console.error('[트랙 A] 에러:', errorMessage)
        if (errorStack) {
            console.error('[트랙 A] 스택:', errorStack)
        }
        
        return NextResponse.json({ 
            error: errorMessage,
            success: 0,
            failed: 0
        }, { status: 500 })
    }
}
