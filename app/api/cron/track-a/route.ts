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
 * 스케줄: 매 정각 1시간 주기 (vercel.json: "0 * * * *")
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { parseJsonArray } from '@/lib/ai/parse-json-response'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { checkDuplicateIssue } from '@/lib/candidate/duplicate-checker'
import { findParentIssue, countKeywordOverlap } from '@/lib/candidate/parent-issue-finder'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import { tokenize } from '@/lib/candidate/tokenizer'
import { getCategoryIds, getCategoryKeywords } from '@/lib/config/categories'
import type { IssueCategory } from '@/lib/config/categories'
import { AUTO_APPROVE_CATEGORIES } from '@/lib/config/candidate-thresholds'
import { sendDoorayImmediateAlert } from '@/lib/dooray-notification'
import { validateIssueCreation, validateTrackAIssue } from '@/lib/validation/issue-creation'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import { searchAndLinkCauseArticles } from '@/lib/candidate/cause-article-searcher'
import {
    AllKeysRateLimitedError,
    verifyIssueByAI,
    filterAndTitleByAI,
    classifyAndSummarizeTimeline,
    samplePostTitles,
    cleanupOrphanedRecords,
} from '@/lib/pipeline/issue-pipeline'
import type { AIVerificationResult, TimelineStageName, TimelineSummaryRow } from '@/lib/pipeline/issue-pipeline'

const BURST_THRESHOLD = parseInt(process.env.COMMUNITY_BURST_THRESHOLD ?? '3')
const WINDOW_MINUTES = parseInt(process.env.COMMUNITY_BURST_WINDOW_MINUTES ?? '10')
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '8')
const AUTO_APPROVE_HEAT_THRESHOLD = parseInt(process.env.AUTO_APPROVE_HEAT_THRESHOLD ?? '30')

// Rate Limit 완화 설정
// 기본 3개: Groq Rate Limit을 고려해 한 번 실행당 최대 3개 키워드 처리
const MAX_KEYWORDS_PER_RUN = parseInt(process.env.TRACK_A_MAX_KEYWORDS ?? '1')
const AI_CALL_DELAY_MS = parseInt(process.env.TRACK_A_AI_DELAY_MS ?? '10000')  // AI 호출 간 대기 시간 (기본 10초)


interface KeywordBurst {
    keyword: string
    count: number
    posts: Array<{ id: string; title: string; created_at: string; source_site: string }>
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
        // 1인칭/2인칭/3인칭 대명사 및 집합 지시어 (로그에서 발견된 패턴)
        '나는', '나도', '내가', '저는', '저도', '제가', '우리', '우리가', '우리는',
        '너는', '너도', '네가', '당신', '여러분', '다들', '모두', '모두가', '모두들',
        '각자', '저들', '이들', '그들',
        // 동사 활용형 (로그에서 발견된 패턴)
        '있는', '있어', '있음', '없는', '없어', '없음',
        '보고', '보는', '봤는데', '봤어', '보니',
        '좋아하는', '싫어하는', '좋아해', '싫어해',
        '하고', '하면서', '하지만', '하는데',
        // 시간/빈도 부사 (로그에서 발견된 패턴)
        '요즘', '아직', '아직도', '벌써', '드디어', '이미', '항상', '맨날', '계속',
        // 전치사/후치사류
        '중에', '중에서', '사이에', '이후에', '이전에', '때문에',
        // 커뮤니티 관용어
        '레전드', '미쳤다', '소름', '공감', '비밀', '질문', '추천', '후기', '리뷰',
        '모음', '정리', '모르겠', '궁금', '혹시', '도움', '감사',
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
                model: 'llama-3.3-70b-versatile',
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
                model: 'llama-3.3-70b-versatile',
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
                model: 'llama-3.3-70b-versatile',
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
        // 이벤트형 범용어: 단독으로는 "누구의" 이벤트인지 알 수 없어 카테고리 오분류 및
        // 무관한 뉴스 대량 수집의 원인이 됨. 인물명 등 구체적 키워드가 burst keyword가 되도록 제외.
        // 예: "결혼"(50건) > "문채원"(30건) → "결혼"이 먼저 처리되어 카테고리 사회 오분류
        '결혼', '이혼', '임신', '열애', '사망', '부고', '사고', '사과', '고소', '고백', '은퇴',
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
        console.log(`  주제: "${aiResult.topic}"`)
        
        const category = aiResult.category
        const tentativeTitle = aiResult.tentativeTitle
        const topic = aiResult.topic
        const topicDescription = aiResult.topicDescription
        
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
            let newsLinked = 0
            let newsSkipReason: string | undefined
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
                    newsLinked = filteredNewsIds.length
                    console.log(`  → 기존 이슈에 뉴스 ${filteredNewsIds.length}/${newsItems.length}건 추가 연결`)
                } else {
                    newsSkipReason = 'AI 필터링 후 관련 없음'
                    console.log(`  → 관련 뉴스 없음 (AI 필터링 후 0건) — 연결 건너뜀`)
                }
            } catch {
                // AI 실패 시 폴백: 커뮤니티만 전체 연결 (뉴스는 연결 안 함 — 노이즈 방지)
                newsSkipReason = 'AI 오류 (폴백)'
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
                newsLinked,
                ...(newsSkipReason && { newsSkipReason }),
            })
            failedCount++
            continue
        }

        // 4-3b. 파생 이벤트 체크 (Groq — Claude 비용 없음)
        // 중복은 아니지만 기존 활성 이슈의 후속/파생 사건이면 새 이슈 대신 타임라인 포인트 추가
        const parentResult = await findParentIssue(supabaseAdmin, tentativeTitle, category)

        if (parentResult) {
            console.log(`  → [파생 이벤트 감지] "${parentResult.parentIssueTitle}" (${parentResult.stage}, 신뢰도: ${parentResult.confidence}%)`)

            try {
                const { relevantCommunityIds: filteredCommunityIds, relevantNewsIds: filteredNewsIds } = await filterAndTitleByAI(
                    burst.keyword,
                    parentResult.parentIssueTitle,
                    newsItems,
                    burst.posts,
                )

                if (filteredCommunityIds.length > 0) {
                    await supabaseAdmin
                        .from('community_data')
                        .update({ issue_id: parentResult.parentIssueId })
                        .in('id', filteredCommunityIds)
                    console.log(`  → 부모 이슈에 커뮤니티 ${filteredCommunityIds.length}건 연결`)
                }

                if (filteredNewsIds.length > 0) {
                    await supabaseAdmin
                        .from('news_data')
                        .update({ issue_id: parentResult.parentIssueId })
                        .in('id', filteredNewsIds)
                        .is('issue_id', null)
                    console.log(`  → 부모 이슈에 뉴스 ${filteredNewsIds.length}건 연결`)

                    // 첫 번째 관련 뉴스를 타임라인 포인트로 추가
                    // 최후 방어선: 뉴스 제목과 부모 이슈 제목 간 키워드가 1개 이상 겹쳐야만 삽입
                    const firstNews = newsItems.find(n => filteredNewsIds.includes(n.id))
                    if (firstNews) {
                        const overlap = countKeywordOverlap(firstNews.title ?? '', parentResult.parentIssueTitle)
                        if (overlap < 1) {
                            console.warn(`  ⚠️ [타임라인 삽입 거부] 키워드 겹침 없음 — "${firstNews.title}" ↔ "${parentResult.parentIssueTitle}"`)
                        } else {
                            await supabaseAdmin
                                .from('timeline_points')
                                .insert({
                                    issue_id: parentResult.parentIssueId,
                                    title: firstNews.title,
                                    occurred_at: firstNews.published_at,
                                    source_url: firstNews.link,
                                    stage: parentResult.stage,
                                    ai_summary: null,
                                })
                            console.log(`  → 타임라인 포인트 추가 (${parentResult.stage}: "${firstNews.title}")`)
                        }
                    }
                }
            } catch {
                // AI 실패 시 폴백: 커뮤니티만 전체 연결
                const postIds = burst.posts.map((p: { id: string }) => p.id)
                await supabaseAdmin
                    .from('community_data')
                    .update({ issue_id: parentResult.parentIssueId })
                    .in('id', postIds)
                console.log(`  → [폴백] 부모 이슈에 커뮤니티 ${postIds.length}건 연결`)
            }

            await logTrackA(burst.keyword, burst.count, 'derivative_linked', {
                parentIssueId: parentResult.parentIssueId,
                parentIssueTitle: parentResult.parentIssueTitle,
                stage: parentResult.stage,
                confidence: parentResult.confidence,
                reason: parentResult.reason,
            })
            successCount++
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
            topic,  // AI 생성 주제
            topic_description: topicDescription,  // AI 생성 주제 설명
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
            .select('id, created_at')
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
        
        // 4-7-1. 이미지 자동 생성 — 응답 후 비동기 실행 (타임아웃 영향 없음)
        const _issueId = newIssue.id
        const _issueTitle = finalIssueTitle
        const _category = category
        const _newsLinks = relevantNews.slice(0, 5).map((n: { link?: string }) => n.link).filter(Boolean) as string[]

        after(async () => {
            try {
                const { fetchPexelsImages } = await import('@/lib/pexels')
                const thumbnailUrls = await fetchPexelsImages(_issueTitle, _category)

                if (thumbnailUrls.length > 0) {
                    await supabaseAdmin
                        .from('issues')
                        .update({ thumbnail_urls: thumbnailUrls, primary_thumbnail_index: 0 })
                        .eq('id', _issueId)
                    console.log(`[이미지 after] "${_issueTitle}" — ${thumbnailUrls.length}개 저장`)
                } else {
                    console.log(`[이미지 after] "${_issueTitle}" — 이미지 없음`)
                }
            } catch (e) {
                console.warn(`[이미지 after 실패] "${_issueTitle}":`, e)
            }
        })
        
        // 4-8. 타임라인 준비 (실제 연결된 뉴스 기준)
        console.log(`  → [타임라인 생성 시작] 연결된 뉴스 ${linkedNewsCount}건 기준`)
        
        let timelinePoints: Array<{
            issue_id: string
            title: string
            occurred_at: string
            source_url: string
            stage: TimelineStageName
        }> = []
        let timelineSummaryRows: TimelineSummaryRow[] = []
        let issueBriefSummary: { intro: string; bullets: string[]; conclusion: string } | null = null

        if (linkedNewsCount > 0) {
            const sortedNews = [...(linkedNews ?? [])].sort((a, b) => {
                const aTime = relevantNews.find(n => n.id === a.id)?.published_at ?? ''
                const bTime = relevantNews.find(n => n.id === b.id)?.published_at ?? ''
                return new Date(aTime).getTime() - new Date(bTime).getTime()
            })

            const sampledNews = sortedNews.slice(0, 5)
            const newsForClassify = sampledNews.map(news => {
                const item = relevantNews.find(n => n.id === news.id)
                return {
                    id: news.id,
                    title: item?.title ?? '',
                    published_at: item?.published_at ?? new Date().toISOString(),
                    link: item?.link ?? '',
                }
            })

            // Groq 1번 호출로 단계 분류 + 요약 + 브리핑 동시 생성
            const { stageMap, pointSummaries, summaryRows, briefSummary } = await classifyAndSummarizeTimeline(
                finalIssueTitle,
                newsForClassify,
                '점화',
            )

            timelinePoints = sampledNews.map(news => {
                const newsItem = relevantNews.find(n => n.id === news.id)
                return {
                    issue_id: newIssue.id,
                    title: newsItem?.title ?? '',
                    occurred_at: newsItem?.published_at ?? new Date().toISOString(),
                    source_url: newsItem?.link ?? '',
                    stage: stageMap.get(news.id) ?? '전개',
                    ai_summary: pointSummaries.get(news.id) ?? null,
                }
            })

            timelineSummaryRows = summaryRows.map(s => ({ ...s, issue_id: newIssue.id }))
            issueBriefSummary = briefSummary
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

        // 원인 기사 역방향 탐색 (비동기 — 실패해도 이슈 생성에 영향 없음)
        searchAndLinkCauseArticles(
            newIssue.id,
            finalIssueTitle,
            topicDescription ?? null,
            newIssue.created_at,
            category,
        ).catch(err => console.warn(`  ⚠️ [원인탐색 비동기 실패]`, err))

        // 요약 캐시 저장 (유저 접속 시 Groq 호출 없이 바로 노출)
        if (timelineSummaryRows.length > 0) {
            const { error: summaryError } = await supabaseAdmin
                .from('timeline_summaries')
                .upsert(timelineSummaryRows, { onConflict: 'issue_id,stage' })
            if (summaryError) {
                console.warn(`  ⚠️ [요약 캐시 저장 실패] ${summaryError.message}`)
            } else {
                console.log(`  ✓ [요약 캐시 저장] ${timelineSummaryRows.length}개 단계`)
            }
        }

        // 브리핑 저장
        if (issueBriefSummary) {
            const { error: briefError } = await supabaseAdmin
                .from('issues')
                .update({ brief_summary: issueBriefSummary })
                .eq('id', newIssue.id)
            if (briefError) {
                console.warn(`  ⚠️ [브리핑 저장 실패] ${briefError.message}`)
            } else {
                console.log(`  ✓ [브리핑 저장] "${finalIssueTitle}"`)
            }
        }

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

        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                heat_index: heatIndex,
                created_heat_index: heatIndex,
                approval_status: approvalStatus,
                approval_type: shouldAutoApprove ? 'auto' : null,
                approved_at: shouldAutoApprove ? now : null,
            })
            .eq('id', newIssue.id)

        if (updateError) {
            console.error(`  ❌ [화력 업데이트 실패] ${updateError.message} - 이슈 삭제`)
            await cleanupOrphanedRecords(newIssue.id)
            await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
            await logTrackA(burst.keyword, burst.count, 'update_failed', {
                finalIssueTitle,
                error: updateError.message,
            })
            failedCount++
            continue
        }

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

        // 자동 승인된 이슈: 투표·토론 주제 즉시 생성
        if (shouldAutoApprove) {
            try {
                const metadata = {
                    id: newIssue.id,
                    title: finalIssueTitle,
                    category,
                    status: '점화',
                    heat_index: heatIndex,
                }

                const [topics, votes] = await Promise.all([
                    generateDiscussionTopics(metadata, 3).catch(() => []),
                    generateVoteOptions(metadata, 1).catch(() => []),
                ])

                if (topics.length > 0) {
                    await supabaseAdmin.from('discussion_topics').insert(
                        topics.map(t => ({
                            issue_id: newIssue.id,
                            body: t.content,
                            is_ai_generated: true,
                            approval_status: '대기',
                        }))
                    )
                    console.log(`  ✓ [토론 생성] "${finalIssueTitle}" — ${topics.length}건`)
                }

                if (votes.length > 0) {
                    const vote = votes[0]
                    const { data: newVote } = await supabaseAdmin
                        .from('votes')
                        .insert({
                            issue_id: newIssue.id,
                            title: vote.title,
                            phase: '대기',
                            approval_status: '대기',
                            is_ai_generated: true,
                            issue_status_snapshot: '점화',
                        })
                        .select('id')
                        .single()

                    if (newVote) {
                        await supabaseAdmin.from('vote_choices').insert(
                            vote.choices.map(label => ({
                                vote_id: newVote.id,
                                label,
                            }))
                        )
                        console.log(`  ✓ [투표 생성] "${finalIssueTitle}" — "${vote.title}"`)
                    }
                }
            } catch (e) {
                console.error(`  ✗ [투표·토론 자동 생성 실패] "${finalIssueTitle}":`, e)
            }
        }

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
