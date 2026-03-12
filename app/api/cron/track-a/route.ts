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
 * 2. Groq AI (llama-3.1-8b-instant)로 "진짜 이슈인지" 판단
 * 3. YES이면 → Groq AI가 뽑은 키워드로 네이버 뉴스 API 즉시 타겟 검색
 * 4. 뉴스 1건 이상 발견 → 이슈 후보 등록 (approval_status='대기')
 * 5. 뉴스 0건 → 등록 보류 (루머 가능성)
 * 
 * 스케줄: 매 30분 (GitHub Actions: cron-track-a.yml)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { checkDuplicateIssue } from '@/lib/candidate/duplicate-checker'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import { tokenize } from '@/lib/candidate/tokenizer'
import { getCategoryIds, getCategoryKeywords } from '@/lib/config/categories'
import type { IssueCategory } from '@/lib/config/categories'

const ENABLE_TRACK_A = process.env.ENABLE_TRACK_A === 'true'
const BURST_THRESHOLD = parseInt(process.env.COMMUNITY_BURST_THRESHOLD ?? '10')
const WINDOW_MINUTES = parseInt(process.env.COMMUNITY_BURST_WINDOW_MINUTES ?? '10')
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')

interface KeywordBurst {
    keyword: string
    count: number
    posts: Array<{ id: string; title: string; created_at: string }>
}

interface AIVerificationResult {
    isIssue: boolean
    confidence: number
    reason: string
    searchKeyword: string
    issueTitle: string  // 이슈 제목도 AI가 생성
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
 * extractCommunityKeywords - 커뮤니티 글 제목에서 키워드 추출
 */
function extractCommunityKeywords(title: string): string[] {
    return tokenize(title).map(w => w.toLowerCase())
}

/**
 * simpleInferCategory - 간단한 키워드 기반 카테고리 분류
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
 * verifyIssueByAI - AI로 이슈 여부 및 검색 키워드 추출
 */
async function verifyIssueByAI(
    keyword: string,
    sampleTitles: string[]
): Promise<AIVerificationResult> {
    try {
        const titlesText = sampleTitles.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n')
        
        const prompt = `커뮤니티에서 급증한 키워드가 뉴스 이슈가 될 만한지 판단하고, 법적으로 안전한 이슈 제목을 생성하세요.

키워드: "${keyword}"
관련 게시글:
${titlesText}

판단 기준:
1. 사회적 논란/사건 → 이슈 (예: 연예인 사건, 정치 이슈, 사회 이슈)
2. 단순 유행어/밈 → 이슈 아님 (예: "띵작", "레전드", "ㅋㅋㅋ")
3. 스팸/홍보 → 이슈 아님
4. 정보 가치 없는 반응 → 이슈 아님
5. 스포츠 경기/대회 → 이슈 (예: "WBC 한국 경기", "손흥민 골")

이슈 제목 생성 규칙 (법적 안전성 최우선):
- 특정인 비방/명예훼손 금지: "OO 논란" 대신 "OO 관련 이슈" 사용
- 단정적 표현 금지: "OO 사건", "OO 사고" 대신 "OO 관련 논의"
- 스포츠 경기: "OO 경기", "OO 대회" (안전)
- 일반 사건: "OO 관련 이슈", "OO 논의", "OO 화제"
- 간결하게 15자 이내
- 사실 확인 안 된 내용은 "OO 관련 논의" 형태로

예시:
- 좋음: "WBC 한국 경기", "무신사 관련 논의", "이재명 재판 화제"
- 나쁨: "무신사 논란", "이재명 유죄", "OO 사기 사건"

응답 형식 (JSON만):
{
  "isIssue": true/false,
  "confidence": 0-100,
  "reason": "판단 이유 (한 줄)",
  "searchKeyword": "네이버 뉴스 검색용 키워드 (이슈가 아니면 빈 문자열)",
  "issueTitle": "생성된 이슈 제목 (이슈가 아니면 빈 문자열)"
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            {
                model: 'llama-3.1-8b-instant',
                temperature: 0.2,
                max_tokens: 300,  // 이슈 제목 추가로 토큰 늘림
            }
        )
        
        const result = parseJsonObject<AIVerificationResult>(content)
        if (!result) {
            return { 
                isIssue: false, 
                confidence: 0, 
                reason: 'JSON 파싱 실패',
                searchKeyword: '',
                issueTitle: ''
            }
        }
        
        return {
            isIssue: result.isIssue && result.confidence >= 70,
            confidence: result.confidence,
            reason: result.reason,
            searchKeyword: result.searchKeyword || keyword,
            issueTitle: result.issueTitle || `${keyword} 관련 이슈`,  // fallback
        }
        
    } catch (error) {
        console.error('[AI 이슈 검증 에러]', error)
        return { 
            isIssue: false, 
            confidence: 0, 
            reason: `에러: ${error}`,
            searchKeyword: '',
            issueTitle: ''
        }
    }
}

/**
 * processTrackA - 트랙 A 메인 로직
 */
async function processTrackA(): Promise<{ success: number; failed: number }> {
    console.log(`[트랙 A] 시작 (최근 ${WINDOW_MINUTES}분, 임계값: ${BURST_THRESHOLD}건)`)
    
    const cutoffTime = new Date(
        Date.now() - WINDOW_MINUTES * 60 * 1000
    ).toISOString()
    
    // 1단계: 최근 커뮤니티 수집 건 조회
    const { data: recentPosts, error } = await supabaseAdmin
        .from('community_data')
        .select('id, title, created_at')
        .gte('created_at', cutoffTime)
        .is('issue_id', null)
        .order('created_at', { ascending: false })
    
    if (error || !recentPosts || recentPosts.length === 0) {
        console.log('[트랙 A] 최근 게시글 없음')
        return { success: 0, failed: 0 }
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
    
    // 3단계: 급증 키워드 필터링
    const burstKeywords: KeywordBurst[] = []
    for (const [keyword, posts] of keywordMap) {
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
    
    // 4단계: 상위 3개 키워드 처리 (Rate Limit 방지)
    for (const burst of burstKeywords.slice(0, 3)) {
        console.log(`\n[키워드 검증] "${burst.keyword}" (${burst.count}건)`)
        
        // 4-1. AI 이슈 검증 및 검색 키워드 추출
        const sampleTitles = burst.posts.slice(0, 5).map(p => p.title)
        const aiResult = await verifyIssueByAI(burst.keyword, sampleTitles)
        
        if (!aiResult.isIssue) {
            console.log(`  ✗ [AI 검증 실패] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
            failedCount++
            continue
        }
        
        console.log(`  ✓ [AI 검증 통과] 신뢰도 ${aiResult.confidence}% - ${aiResult.reason}`)
        console.log(`  이슈 제목: "${aiResult.issueTitle}"`)
        console.log(`  검색 키워드: "${aiResult.searchKeyword}"`)
        
        // 4-2. 네이버 뉴스 즉시 타겟 검색
        const newsItems = await searchNaverNewsByKeyword(aiResult.searchKeyword)
        
        if (newsItems.length === 0) {
            console.log(`  ✗ [뉴스 없음] 네이버 뉴스 0건 - 루머 가능성`)
            failedCount++
            continue
        }
        
        console.log(`  ✓ [뉴스 발견] 네이버 뉴스 ${newsItems.length}건`)
        
        // 4-3. 중복 체크 (AI가 생성한 제목 사용)
        const issueTitle = aiResult.issueTitle
        const duplicateCheck = await checkDuplicateIssue(supabaseAdmin, issueTitle)
        
        if (duplicateCheck.isDuplicate) {
            console.log(`  ✗ [중복 이슈] "${duplicateCheck.existingIssue?.title}"`)
            
            // 기존 이슈에 커뮤니티 글 연결
            await supabaseAdmin
                .from('community_data')
                .update({ issue_id: duplicateCheck.existingIssue!.id })
                .in('id', burst.posts.map(p => p.id))
            
            failedCount++
            continue
        }
        
        // 4-4. 카테고리 분류 (키워드 기반)
        const category = simpleInferCategory(issueTitle)
        
        // 4-5. 이슈 후보 등록
        const { data: newIssue, error: createError } = await supabaseAdmin
            .from('issues')
            .insert({
                title: issueTitle,
                description: null,
                status: '점화',
                category,
                approval_status: '대기',
                source_track: 'track_a',
            })
            .select('id')
            .single()
        
        if (createError || !newIssue) {
            console.error('[이슈 생성 에러]', createError)
            failedCount++
            continue
        }
        
        // 4-6. 커뮤니티 글 연결
        await supabaseAdmin
            .from('community_data')
            .update({ issue_id: newIssue.id })
            .in('id', burst.posts.map(p => p.id))
        
        // 4-7. 뉴스 연결
        await supabaseAdmin
            .from('news_data')
            .update({ issue_id: newIssue.id })
            .in('id', newsItems.map(n => n.id))
        
        // 4-8. 타임라인 자동 생성 (뉴스 기준)
        // 가장 빠른 뉴스를 "발단"으로, 이후 뉴스들은 "전개"로
        try {
            const sortedNews = [...newsItems].sort((a, b) => 
                new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
            )
            
            const timelinePoints = sortedNews.slice(0, 5).map((news, index) => ({
                issue_id: newIssue.id,
                occurred_at: news.published_at,
                source_url: news.link,
                stage: (index === 0 ? '발단' : '전개') as '발단' | '전개' | '파생' | '진정',
            }))
            
            if (timelinePoints.length > 0) {
                const { error: timelineError } = await supabaseAdmin
                    .from('timeline_points')
                    .insert(timelinePoints)
                
                if (timelineError) {
                    console.error('  ⚠️  타임라인 생성 에러:', timelineError.message, timelineError.details)
                } else {
                    console.log(`  ✓ [타임라인 생성] ${timelinePoints.length}개 포인트`)
                }
            }
        } catch (timelineErr) {
            console.error('  ⚠️  타임라인 생성 예외:', timelineErr)
        }
        
        // 4-9. 화력 계산
        const heatIndex = await calculateHeatIndex(newIssue.id).catch(() => 0)
        
        // 화력 15점 미만이면 이슈 삭제
        if (heatIndex < MIN_HEAT_TO_REGISTER) {
            console.log(`  ❌ [화력 부족] "${issueTitle}" (화력: ${heatIndex}점, 최소: ${MIN_HEAT_TO_REGISTER}점) - 이슈 삭제`)
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', newIssue.id)
            failedCount++
            continue
        }
        
        await supabaseAdmin
            .from('issues')
            .update({ 
                heat_index: heatIndex,
                created_heat_index: heatIndex
            })
            .eq('id', newIssue.id)
        
        console.log(`  ✅ [이슈 후보 등록] "${issueTitle}" (ID: ${newIssue.id}, 화력: ${heatIndex}점, 카테고리: ${category})`)
        successCount++
        
        // Rate Limit 방지
        await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log(`\n[트랙 A] 완료: 성공 ${successCount}개, 실패 ${failedCount}개`)
    return { success: successCount, failed: failedCount }
}

/**
 * POST /api/cron/track-a
 */
export async function POST(req: NextRequest) {
    if (!verifyCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (!ENABLE_TRACK_A) {
        return NextResponse.json({ 
            message: '트랙 A 비활성화됨 (ENABLE_TRACK_A=false)',
            success: 0,
            failed: 0
        })
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
