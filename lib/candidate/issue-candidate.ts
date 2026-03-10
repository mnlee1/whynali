/**
 * lib/candidate/issue-candidate.ts
 *
 * [이슈 후보 자동 생성]
 *
 * 최근 24시간 미연결 수집 건(뉴스·커뮤니티)을 키워드 기반으로 묶어
 * 이슈 후보 그룹을 만들고, 07_이슈등록_화력_정렬_규격 §1 조건에 따라
 * 이슈를 대기 등록하거나 자동 승인합니다.
 *
 * 흐름:
 *   1. 뉴스 5건 이상 + 고유 출처 2곳 이상 + 화력 15점 이상: approval_status='대기'로 등록
 *   2. 화력 30점 이상 + 허용 카테고리(사회/기술/스포츠): 자동 승인
 *   3. 같은 제목이 최근 24시간 내 이미 등록된 경우 중복 등록 방지
 *
 * 임계값은 환경변수로 조정 가능:
 *   CANDIDATE_ALERT_THRESHOLD (기본 5) - 최소 뉴스 건수
 *   CANDIDATE_AUTO_APPROVE_THRESHOLD (기본 30) - 자동 승인 화력 기준
 *   CANDIDATE_MIN_HEAT_TO_REGISTER (기본 15) - 최소 등록 화력
 *   CANDIDATE_WINDOW_HOURS (기본 24) — 건수 집계 시간 창
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import type { IssueCategory } from '@/lib/config/categories'
import {
    getAllCategoryKeywords,
    getAllContextRules,
    getCategoryIds,
} from '@/lib/config/categories'
import { validateGroups } from '@/lib/ai/perplexity-group-validator'
import { groupNewsByPerplexity, applyAIGrouping } from '@/lib/ai/perplexity-grouping'
import {
    classifyCategoryByAI,
    shouldUseAIClassification,
} from '@/lib/candidate/category-classifier'
import {
    detectBurst,
    getBurstLevel,
    formatBurstReport,
} from '@/lib/candidate/burst-detector'
import { tokenize } from '@/lib/candidate/tokenizer'
import {
    groupItems,
    groupItemsByAI,
    fallbackTokenMatching,
} from '@/lib/candidate/grouping-pipeline'
import {
    selectRepresentativeTitle,
    stripMediaPrefix,
} from '@/lib/candidate/title-selector'
import {
    CANDIDATE_ALERT_THRESHOLD as ALERT_THRESHOLD,
    CANDIDATE_AUTO_APPROVE_THRESHOLD as AUTO_APPROVE_THRESHOLD,
    CANDIDATE_NO_RESPONSE_HOURS as NO_RESPONSE_HOURS,
    CANDIDATE_WINDOW_HOURS as WINDOW_HOURS,
    CANDIDATE_MIN_UNIQUE_SOURCES as MIN_UNIQUE_SOURCES,
    CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT_TO_REGISTER,
    AUTO_APPROVE_CATEGORIES,
} from '@/lib/config/candidate-thresholds'

/*
 * 커뮤니티 글을 이슈에 매칭할 때 요구하는 최소 공통 키워드 수.
 * 뉴스 그루핑(>= 1)과 별도로 더 엄격하게 적용해 관련 없는 글 유입 방지.
 * 기본 2: "김연아" 한 단어만 겹쳐도 매칭되는 노이즈를 차단.
 */
const COMMUNITY_MATCH_THRESHOLD = parseInt(process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2')

interface RawItem {
    id: string
    title: string
    created_at: string
    type: 'news' | 'community'
    category: string | null  // news_data.category (커뮤니티는 null)
    source: string | null    // news_data.source (출처 다양성 판별용, 커뮤니티는 null)
}

interface CandidateGroup {
    tokens: string[]      // 후보 대표 토큰 (합집합으로 갱신됨)
    items: RawItem[]
}

export interface CandidateAlert {
    title: string
    count: number
    newsCount: number
    communityCount: number
}

export interface CandidateResult {
    created: number
    alerts: CandidateAlert[]
    evaluated: number
}

/**
 * CATEGORY_KEYWORDS - 카테고리별 제목 키워드 사전
 * 설정 파일에서 자동 로드
 */
const CATEGORY_KEYWORDS = getAllCategoryKeywords()

/**
 * CONTEXT_RULES - 맥락 기반 카테고리 판단 규칙
 * 설정 파일에서 자동 로드
 */
const CONTEXT_RULES = getAllContextRules()

/**
 * inferCategory - 그룹 내 제목 키워드 스코어링으로 카테고리 결정
 *
 * 1차: 전체 제목을 합산해 카테고리별 키워드 매칭 수를 점수화
 * 2차: 맥락 기반 규칙 적용 (특정 키워드 조합 시 점수 대폭 증가)
 * 3차: 수집 카테고리 다수결 점수 계산
 * 4차: 키워드 점수와 다수결 점수를 비교해 더 명확한 쪽 선택
 *      - 맥락 규칙 매칭되면 키워드 우선
 *      - 다수결 카테고리의 키워드 점수가 0이면 키워드 우선 (네이버 오류 판단)
 *      - 그 외에는 다수결 우선 (네이버 카테고리가 더 정확한 경우 많음)
 * 5차: 신뢰도 낮으면 AI 재분류 (NEW)
 * 6차(폴백): 둘 다 없으면 '사회' 기본값
 */
async function inferCategory(items: RawItem[]): Promise<IssueCategory> {
    const validCategories = getCategoryIds() as IssueCategory[]
    const allTitles = items.map((i) => i.title).join(' ')

    const keywordScores = validCategories.reduce<Record<string, number>>(
        (acc, cat) => {
            acc[cat] = CATEGORY_KEYWORDS[cat].filter((kw) => allTitles.includes(kw)).length
            return acc
        },
        {}
    )

    let contextMatched = false
    for (const rule of CONTEXT_RULES) {
        const allKeywordsPresent = rule.keywords.every((kw) => allTitles.includes(kw))
        if (allKeywordsPresent) {
            keywordScores[rule.category] = (keywordScores[rule.category] ?? 0) + rule.boost
            contextMatched = true
        }
    }

    const categoryCounts = items
        .filter((i) => i.category !== null)
        .reduce<Record<string, number>>((acc, i) => {
            const cat = i.category as string
            if (validCategories.includes(cat as IssueCategory)) {
                acc[cat] = (acc[cat] ?? 0) + 1
            }
            return acc
        }, {})

    const topKeyword = (Object.entries(keywordScores) as [IssueCategory, number][])
        .sort((a, b) => b[1] - a[1])[0]
    
    const topMajority = (Object.entries(categoryCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1])[0]

    // 기존 로직으로 1차 분류
    let preliminaryCategory: IssueCategory | null = null
    
    if (contextMatched && topKeyword && topKeyword[1] > 0) {
        preliminaryCategory = topKeyword[0]
    } else if (topMajority && topMajority[1] > 0) {
        const majorityCategory = topMajority[0] as IssueCategory
        const majorityKeywordScore = keywordScores[majorityCategory] ?? 0
        
        if (majorityKeywordScore === 0 && topKeyword && topKeyword[1] > 0) {
            preliminaryCategory = topKeyword[0]
        } else {
            preliminaryCategory = majorityCategory
        }
    } else if (topKeyword && topKeyword[1] > 0) {
        preliminaryCategory = topKeyword[0]
    }

    // AI 재분류 필요 여부 판단
    const keywordScore = topKeyword?.[1] ?? 0
    const majorityScore = topMajority?.[1] ?? 0
    
    if (shouldUseAIClassification(keywordScore, contextMatched, majorityScore)) {
        try {
            const titles = items.map(i => i.title)
            const aiResult = await classifyCategoryByAI(titles)
            
            console.log(
                `[AI 카테고리 재분류] "${items[0].title.substring(0, 40)}..." ` +
                `키워드: ${preliminaryCategory ?? '없음'} → AI: ${aiResult.category} ` +
                `(신뢰도: ${aiResult.confidence}%, 이유: ${aiResult.reason})`
            )
            
            // 신뢰도 70% 이상이면 AI 결과 채택
            if (aiResult.confidence >= 70) {
                return aiResult.category
            }
        } catch (error) {
            console.error('[AI 카테고리 분류 에러] 키워드 방식으로 폴백:', error)
        }
    }

    // AI 재분류 실패 또는 불필요 시 기존 결과 사용
    return preliminaryCategory ?? '사회'
}

/**
 * isRecentlyCreated - 최근 5분 이내 동일 제목 이슈 존재 여부 확인
 * 
 * cron 동시 실행 시 중복 INSERT 방지용 1차 guard.
 * collect-news와 filter-candidates가 30분 간격으로 겹쳐 실행될 때
 * 같은 news_data를 두 인스턴스가 동시에 읽어 중복 이슈가 생기는 것을 방지합니다.
 * 
 * 기존 checkDuplicateIssue는 1시간 창으로 동작하고 AI 비교를 포함하므로 느림.
 * 이 함수는 5분 이내 정확한 제목 일치만 체크하는 빠른 guard입니다.
 */
async function isRecentlyCreated(title: string): Promise<boolean> {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data } = await supabaseAdmin
        .from('issues')
        .select('id')
        .eq('title', title)
        .gte('created_at', since)
        .limit(1)
    return (data?.length ?? 0) > 0
}

/**
 * linkCollections - 수집 건에 issue_id 연결
 *
 * 이슈 등록(대기·승인) 시 관련 뉴스·커뮤니티 수집 건에 issue_id를 연결합니다.
 */
async function linkCollections(
    issueId: string,
    newsIds: string[],
    communityIds: string[]
): Promise<void> {
    const linkPromises: PromiseLike<unknown>[] = []

    if (newsIds.length > 0) {
        linkPromises.push(
            supabaseAdmin
                .from('news_data')
                .update({ issue_id: issueId })
                .in('id', newsIds)
        )
    }

    if (communityIds.length > 0) {
        linkPromises.push(
            supabaseAdmin
                .from('community_data')
                .update({ issue_id: issueId })
                .in('id', communityIds)
        )
    }

    await Promise.all(linkPromises as Promise<unknown>[])
}

/**
 * checkForDuplicateIssue - 중복 이슈 체크
 * 
 * 1단계: 정확한 제목 일치 체크
 * 2단계: AI 기반 유사 이슈 체크 (옵션)
 */
async function checkForDuplicateIssue(
    representativeTitle: string,
    since24h: string
): Promise<{ id: string; title: string; approval_status: string; heat_index: number | null } | null> {
    const enableAIDuplicateCheck = process.env.ENABLE_AI_DUPLICATE_CHECK === 'true'
    
    const { data: exactMatch } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, heat_index')
        .eq('title', representativeTitle)
        .gte('created_at', since24h)
        .limit(1)

    let existingIssue = exactMatch?.[0] ?? null

    if (!existingIssue && enableAIDuplicateCheck) {
        const { data: recentIssues } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, heat_index')
            .gte('created_at', since24h)
            .order('created_at', { ascending: false })
            .limit(20)
        
        if (recentIssues && recentIssues.length > 0) {
            const { checkDuplicateWithAI } = await import('@/lib/ai/duplicate-checker')
            
            for (const issue of recentIssues) {
                try {
                    const result = await checkDuplicateWithAI(issue.title, representativeTitle)
                    
                    if (result.isDuplicate) {
                        console.log(`[AI 중복 감지] "${representativeTitle}" → "${issue.title}" (${result.confidence}% - ${result.reason})`)
                        existingIssue = issue
                        break
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 3000))
                    
                } catch (error) {
                    console.error('[AI 중복 체크 에러]', error)
                    break
                }
            }
        }
    }
    
    return existingIssue
}

/**
 * handleExistingIssue - 기존 이슈 처리
 * 
 * 기존 이슈에 수집 건을 연결하고, 화력 재계산 후 자동 승인 여부를 판단합니다.
 */
async function handleExistingIssue(
    existingIssue: { id: string; title: string; approval_status: string; heat_index: number | null },
    newsIds: string[],
    communityIds: string[],
    representativeTitle: string,
    issueCategory: IssueCategory,
    recentCount: number,
    result: CandidateResult,
    now: Date
): Promise<'continue' | 'processed'> {
    await linkCollections(existingIssue.id, newsIds, communityIds)
    const actualHeat = await calculateHeatIndex(existingIssue.id).catch(() => 0)
    
    if (actualHeat < MIN_HEAT_TO_REGISTER) {
        console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
        await supabaseAdmin
            .from('issues')
            .delete()
            .eq('id', existingIssue.id)
        return 'continue'
    }
    
    if (existingIssue.approval_status === '대기') {
        const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
            AUTO_APPROVE_CATEGORIES.includes(issueCategory)
        
        if (shouldAutoApprove) {
            const { error: updateError } = await supabaseAdmin
                .from('issues')
                .update({ 
                    approval_status: '승인', 
                    approval_type: 'auto',
                    approval_heat_index: actualHeat,
                    approved_at: now.toISOString() 
                })
                .eq('id', existingIssue.id)

            if (!updateError) {
                console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                result.created++
            }
        } else {
            const reason = actualHeat < AUTO_APPROVE_THRESHOLD
                ? `화력 ${actualHeat}점 (자동승인 기준 ${AUTO_APPROVE_THRESHOLD}점 미만)`
                : `${issueCategory} 카테고리는 관리자 승인 필요`
            console.log(`[대기유지] 기존 이슈 "${representativeTitle}" (${reason})`)
            result.alerts.push({
                title: representativeTitle,
                count: recentCount,
                newsCount: newsIds.length,
                communityCount: communityIds.length,
            })
        }
    }
    
    return 'processed'
}

/**
 * createNewIssue - 신규 이슈 생성 및 등록
 * 
 * 임시 이슈를 생성하고, 화력 계산 후 정식 등록합니다.
 */
async function createNewIssue(
    group: CandidateGroup,
    representativeTitle: string,
    newsIds: string[],
    communityIds: string[],
    issueCategory: IssueCategory,
    recentCount: number,
    result: CandidateResult,
    now: Date,
    since24h: string
): Promise<'continue' | 'processed'> {
    const isBurst = detectBurst(group.items)
    const burstLevel = getBurstLevel(group.items)
    
    if (isBurst) {
        console.log(formatBurstReport(representativeTitle, group.items, burstLevel))
    }
    
    const { data: tempIssue, error: tempError } = await supabaseAdmin
        .from('issues')
        .insert({
            title: representativeTitle,
            description: null,
            status: '점화',
            category: issueCategory,
            approval_status: null as any,
            approved_at: null,
            is_urgent: isBurst,
            burst_level: burstLevel,
            source_track: 'news_collection',
        })
        .select('id')
        .single()

    if (tempError || !tempIssue) {
        if (tempError?.code === '23505') {
            console.log(`[Race Condition 감지] "${representativeTitle}" 이미 등록됨, 재체크`)
            const recheckIssue = await checkForDuplicateIssue(representativeTitle, since24h)
            if (recheckIssue) {
                await linkCollections(recheckIssue.id, newsIds, communityIds)
                console.log(`[기존 이슈 연결] "${representativeTitle}"에 ${newsIds.length}건 뉴스 + ${communityIds.length}건 커뮤니티 연결`)
                return 'continue'
            }
        }
        console.error('임시 이슈 생성 에러:', tempError)
        return 'continue'
    }
    
    const finalCheck = await checkForDuplicateIssue(representativeTitle, since24h)
    if (finalCheck && finalCheck.id !== tempIssue.id) {
        console.log(`[Race Condition 방어] 임시 이슈 생성 중 중복 발견, 임시 이슈 삭제: "${representativeTitle}"`)
        await supabaseAdmin
            .from('issues')
            .delete()
            .eq('id', tempIssue.id)
        
        await linkCollections(finalCheck.id, newsIds, communityIds)
        const actualHeat = await calculateHeatIndex(finalCheck.id).catch(() => 0)
        
        if (actualHeat < MIN_HEAT_TO_REGISTER) {
            console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', finalCheck.id)
            return 'continue'
        }
        
        if (finalCheck.approval_status === '대기') {
            const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
                AUTO_APPROVE_CATEGORIES.includes(issueCategory)
            
            if (shouldAutoApprove) {
                await supabaseAdmin
                    .from('issues')
                    .update({ 
                        approval_status: '승인', 
                        approval_type: 'auto',
                        approval_heat_index: actualHeat,
                        approved_at: now.toISOString() 
                    })
                    .eq('id', finalCheck.id)
                console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                result.created++
            }
        }
        return 'continue'
    }

    await linkCollections(tempIssue.id, newsIds, communityIds)
    const actualHeat = await calculateHeatIndex(tempIssue.id).catch(() => 0)
    
    if (actualHeat < MIN_HEAT_TO_REGISTER) {
        console.log(`[필터] 화력 부족으로 이슈 삭제: "${representativeTitle}" (화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
        await supabaseAdmin
            .from('issues')
            .delete()
            .eq('id', tempIssue.id)
        return 'continue'
    }
    
    const autoApproveThreshold = AUTO_APPROVE_THRESHOLD
    const shouldAutoApprove = actualHeat >= autoApproveThreshold &&
        AUTO_APPROVE_CATEGORIES.includes(issueCategory)
    
    const approvalStatus = shouldAutoApprove ? '승인' : '대기'
    
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({
            approval_status: approvalStatus,
            approval_type: shouldAutoApprove ? 'auto' : null,
            approval_heat_index: shouldAutoApprove ? actualHeat : null,
            approved_at: shouldAutoApprove ? now.toISOString() : null,
            created_heat_index: actualHeat,
        })
        .eq('id', tempIssue.id)
    
    if (updateError) {
        console.error('이슈 상태 업데이트 에러:', updateError)
        await supabaseAdmin.from('issues').delete().eq('id', tempIssue.id)
        return 'continue'
    }

    if (shouldAutoApprove) {
        const burstTag = isBurst ? ' 🔥 [급증]' : ''
        console.log(`[자동승인 완료]${burstTag} "${representativeTitle}" (카테고리: ${issueCategory}, 뉴스: ${recentCount}건, 화력: ${actualHeat}점)`)
        result.created++
    } else {
        const reason = actualHeat < autoApproveThreshold
            ? `화력 ${actualHeat}점 (자동승인 기준 ${autoApproveThreshold}점 미만)`
            : `${issueCategory} 카테고리는 관리자 승인 필요`
        const burstTag = isBurst ? ' 🔥 [급증]' : ''
        console.log(`[대기등록 완료]${burstTag} "${representativeTitle}" (${reason}, 뉴스: ${recentCount}건, 화력: ${actualHeat}점)`)
        result.alerts.push({
            title: representativeTitle,
            count: recentCount,
            newsCount: newsIds.length,
            communityCount: communityIds.length,
        })
    }
    
    return 'processed'
}

/**
 * evaluateCandidates - 수집 데이터 분석 후 이슈 후보 평가·등록
 *
 * Cron에서 주기적으로 호출합니다. 관리자 알람 조회 API에서도 사용합니다.
 *
 * 예시:
 * const result = await evaluateCandidates()
 * // result.created: 자동 승인된 이슈 수
 * // result.alerts: 대기 등록된 후보 목록 (관리자 배너용)
 */
export async function evaluateCandidates(): Promise<CandidateResult> {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    /* 집계 시간 창: 환경변수 CANDIDATE_WINDOW_HOURS (기본 3시간) */
    const sinceWindow = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const noResponseCutoff = new Date(
        now.getTime() - NO_RESPONSE_HOURS * 60 * 60 * 1000
    ).toISOString()

    /*
     * 그루핑 전략:
     * - 뉴스만 집계 창(WINDOW_HOURS, 기본 3시간) 내 데이터로 그루핑
     * - 커뮤니티는 최근 24시간 전체를 가져와 키워드 매칭으로 연결
     *   → 커뮤니티 글은 이슈가 뜨고 난 뒤 몇 시간 후에 반응이 올라오므로
     *     3시간 창으로 제한하면 매칭 기회가 거의 없음.
     *   → 커뮤니티 글 제목("장동혁 대표 ㅋㅋ")은 뉴스 제목과 형태가 달라
     *     함께 그루핑하지 않고, 키워드 1개 이상 포함 시 반응 있음으로 처리.
     * - 중복 체크(existingIssues)는 since24h 사용.
     */
    const [{ data: newsItems }, { data: communityItems }] = await Promise.all([
        supabaseAdmin
            .from('news_data')
            .select('id, title, created_at, category, source')
            .is('issue_id', null)
            .gte('created_at', sinceWindow)
            .order('created_at', { ascending: true }),
        supabaseAdmin
            .from('community_data')
            .select('id, title, created_at')
            .is('issue_id', null)
            .gte('created_at', since24h)   // 커뮤니티는 24시간 창으로 더 넓게 조회
            .order('created_at', { ascending: true }),
    ])

    const newsRawItems: RawItem[] = (newsItems ?? []).map((n) => ({
        ...n, type: 'news' as const, category: n.category ?? null, source: n.source ?? null,
    }))

    if (newsRawItems.length === 0) {
        return { created: 0, alerts: [], evaluated: 0 }
    }

    const communityTokenList = (communityItems ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        tokens: tokenize(c.title),
    }))

    const enableAIGrouping = process.env.ENABLE_AI_GROUPING === 'true'
    let groups: CandidateGroup[] = []

    if (enableAIGrouping) {
        try {
            groups = await groupItemsByAI(newsRawItems, 100)
        } catch (error) {
            console.error('[AI 그루핑 전체 실패] 키워드 방식으로 폴백:', error)
            groups = groupItems(newsRawItems)
        }
    } else {
        groups = groupItems(newsRawItems)
        console.log(`[키워드 그루핑] ${newsRawItems.length}건 → ${groups.length}개 그룹`)
    }
    
    // AI 검증: ALERT_THRESHOLD 이상 그룹만 AI로 검증 (선택적)
    // 환경변수로 ON/OFF 가능 (ENABLE_AI_GROUP_VALIDATION=true)
    const enableValidation = process.env.ENABLE_AI_GROUP_VALIDATION === 'true'
    const groupsToValidate = groups.filter(g => g.items.length >= ALERT_THRESHOLD)
    
    let validatedGroupIds = new Set<number>()
    if (enableValidation && groupsToValidate.length > 0) {
        try {
            const validationInputs = groupsToValidate.map((group, idx) => ({
                groupId: String(idx),
                titles: group.items.map(i => i.title),
            }))
            
            const validationResults = await validateGroups(validationInputs)
            
            // isIssue=true && score>=6 인 그룹만 통과 (스포츠/IT 이슈 포함)
            validatedGroupIds = new Set(
                validationResults
                    .filter(r => r.isIssue && r.score >= 6)
                    .map(r => parseInt(r.groupId))
            )
            
            console.log(`AI 그룹 검증: ${groupsToValidate.length}개 중 ${validatedGroupIds.size}개 통과`)
        } catch (error) {
            console.error('AI 그룹 검증 실패, 전체 통과 처리:', error)
            // 에러 시 안전하게 전체 통과
            validatedGroupIds = new Set(groupsToValidate.map((_, idx) => idx))
        }
    }
    
    const result: CandidateResult = { created: 0, alerts: [], evaluated: groups.length }

    for (const [groupIndex, group] of groups.entries()) {
        // 그루핑 대상이 이미 집계 창 내 데이터이므로 그룹 전체 건수가 곧 집계 건수
        const recentCount = group.items.length

        if (recentCount < ALERT_THRESHOLD) continue
        
        // AI 검증이 활성화되어 있으면 통과한 그룹만 처리
        if (enableValidation && !validatedGroupIds.has(groupIndex)) {
            console.log(`그룹 ${groupIndex} AI 검증 탈락, 제목: ${group.items[0]?.title}`)
            continue
        }

        // 팩트체크 필터: 최소 2개 언론사 이상 보도 필수
        // 1. 뉴스 최소 1개 이상 (커뮤니티 전용 그룹 제외)
        // 2. 고유 언론사 최소 2개 이상 (단독 보도/오보 방지)
        const uniqueSources = new Set(
            group.items
                .filter((i) => i.type === 'news' && i.source)
                .map((i) => i.source as string)
        ).size
        const hasNews = group.items.some((i) => i.type === 'news')
        
        if (!hasNews) {
            console.log(`[필터] 뉴스 없음 (커뮤니티 전용) → 제외: "${group.items[0]?.title?.substring(0, 40)}..."`)
            continue
        }
        if (uniqueSources < MIN_UNIQUE_SOURCES) {
            console.log(`[필터] 고유 출처 부족 (${uniqueSources}개 < ${MIN_UNIQUE_SOURCES}개) → 제외: "${group.items[0]?.title?.substring(0, 40)}..."`)
            continue
        }

        const representativeTitle = selectRepresentativeTitle(group.items)

        const enableAICommunityMatching = process.env.ENABLE_AI_COMMUNITY_MATCHING === 'true'
        let matchedCommunityIds: string[] = []
        
        if (enableAICommunityMatching && communityTokenList.length > 0) {
            try {
                const { batchMatchCommunities } = await import('@/lib/ai/perplexity-community-matcher')
                
                const result = await batchMatchCommunities(
                    representativeTitle,
                    communityTokenList.map(c => c.title),
                    70
                )
                
                const aiMatchedIds = result.matchedIndices.map(idx => communityTokenList[idx].id)
                
                const remainingCount = result.totalCount - result.checkedCount
                
                if (remainingCount > 0) {
                    const remainingList = communityTokenList.slice(result.checkedCount)
                    const tokenMatchedIds = fallbackTokenMatching(remainingList, representativeTitle, COMMUNITY_MATCH_THRESHOLD)
                    matchedCommunityIds = [...aiMatchedIds, ...tokenMatchedIds]
                    console.log(`[커뮤니티 매칭] AI ${result.checkedCount}개 + 토큰 ${remainingCount}개 → 총 ${matchedCommunityIds.length}건`)
                } else {
                    matchedCommunityIds = aiMatchedIds
                    console.log(`[커뮤니티 매칭] AI ${result.checkedCount}개 → 총 ${matchedCommunityIds.length}건`)
                }
                
            } catch (error) {
                console.error('[AI 매칭 에러] 토큰 방식으로 폴백:', error)
                matchedCommunityIds = fallbackTokenMatching(communityTokenList, representativeTitle, COMMUNITY_MATCH_THRESHOLD)
            }
        } else {
            matchedCommunityIds = fallbackTokenMatching(communityTokenList, representativeTitle, COMMUNITY_MATCH_THRESHOLD)
        }
        
        const newsIds = group.items.map((i) => i.id)
        const communityIds = matchedCommunityIds
        const issueCategory = await inferCategory(group.items)

        let existingIssue = await checkForDuplicateIssue(representativeTitle, since24h)

        if (existingIssue) {
            // 기존 이슈 화력 재계산 후 필터링
            await linkCollections(existingIssue.id, newsIds, communityIds)
            const actualHeat = await calculateHeatIndex(existingIssue.id).catch(() => 0)
            
            // 실제 화력이 기준 미달이면 삭제
            if (actualHeat < MIN_HEAT_TO_REGISTER) {
                console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
                await supabaseAdmin
                    .from('issues')
                    .delete()
                    .eq('id', existingIssue.id)
                continue
            }
            
            if (existingIssue.approval_status === '대기') {
                // 화력 기반 자동 승인 판정
                const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
                    AUTO_APPROVE_CATEGORIES.includes(issueCategory)
                
                if (shouldAutoApprove) {
                    // 기존 대기 이슈를 자동 승인으로 업데이트
                    const { error: updateError } = await supabaseAdmin
                        .from('issues')
                        .update({ 
                            approval_status: '승인', 
                            approval_type: 'auto',
                            approval_heat_index: actualHeat,
                            approved_at: now.toISOString() 
                        })
                        .eq('id', existingIssue.id)

                    if (!updateError) {
                        console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                        result.created++
                    }
                } else {
                    const reason = actualHeat < AUTO_APPROVE_THRESHOLD
                        ? `화력 ${actualHeat}점 (자동승인 기준 ${AUTO_APPROVE_THRESHOLD}점 미만)`
                        : `${issueCategory} 카테고리는 관리자 승인 필요`
                    console.log(`[대기유지] 기존 이슈 "${representativeTitle}" (${reason})`)
                    // 여전히 대기 중 → 배너 알람 목록에 추가
                    result.alerts.push({
                        title: representativeTitle,
                        count: recentCount,
                        newsCount: newsIds.length,
                        communityCount: communityIds.length,
                    })
                }
            }
            // 승인 또는 반려된 이슈는 재처리하지 않음
            continue
        }

        // 기존 이슈 없음 → 신규 등록
        // 화력 계산을 먼저 하고, 충분하면 등록 (관리자 UI 노출 방지)
        
        // 1차 guard: 최근 5분 이내 동일 제목 존재 시 즉시 스킵 (cron 동시 실행 방지)
        if (await isRecentlyCreated(representativeTitle)) {
            console.log('[중복 스킵 - 최근 생성]', representativeTitle)
            continue
        }
        
        // 1단계: 임시 이슈 생성 (approval_status를 null로 설정해서 UI 노출 안 됨)
        const { data: tempIssue, error: tempError } = await supabaseAdmin
            .from('issues')
            .insert({
                title: representativeTitle,
                description: null,
                status: '점화',
                category: issueCategory,
                approval_status: null as any, // 임시 상태 (UI에서 필터링됨)
                approved_at: null,
            })
            .select('id')
            .single()

        if (tempError || !tempIssue) {
            // Race Condition 가능성: 동시에 같은 이슈가 등록되었을 수 있음
            if (tempError?.code === '23505') { // Unique constraint violation
                console.log(`[Race Condition 감지] "${representativeTitle}" 이미 등록됨, 재체크`)
                // 다시 중복 체크
                const recheckIssue = await checkForDuplicateIssue(representativeTitle, since24h)
                if (recheckIssue) {
                    // 기존 이슈에 수집 건 연결만 수행
                    await linkCollections(recheckIssue.id, newsIds, communityIds)
                    console.log(`[기존 이슈 연결] "${representativeTitle}"에 ${newsIds.length}건 뉴스 + ${communityIds.length}건 커뮤니티 연결`)
                    continue
                }
            }
            console.error('임시 이슈 생성 에러:', tempError)
            continue
        }
        
        // 1.5단계: 임시 이슈 생성 직후 최종 중복 체크 (Race Condition 최종 방어)
        const finalCheck = await checkForDuplicateIssue(representativeTitle, since24h)
        if (finalCheck && finalCheck.id !== tempIssue.id) {
            console.log(`[Race Condition 방어] 임시 이슈 생성 중 중복 발견, 임시 이슈 삭제: "${representativeTitle}"`)
            // 방금 생성한 임시 이슈 삭제
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', tempIssue.id)
            
            // 기존 이슈에 수집 건 연결
            await linkCollections(finalCheck.id, newsIds, communityIds)
            const actualHeat = await calculateHeatIndex(finalCheck.id).catch(() => 0)
            
            // 실제 화력이 기준 미달이면 삭제
            if (actualHeat < MIN_HEAT_TO_REGISTER) {
                console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
                await supabaseAdmin
                    .from('issues')
                    .delete()
                    .eq('id', finalCheck.id)
                continue
            }
            
            // 기존 이슈가 대기 상태이고 자동 승인 조건이면 승인 처리
            if (finalCheck.approval_status === '대기') {
                const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
                    AUTO_APPROVE_CATEGORIES.includes(issueCategory)
                
                if (shouldAutoApprove) {
                    await supabaseAdmin
                        .from('issues')
                        .update({ 
                            approval_status: '승인', 
                            approval_type: 'auto',
                            approval_heat_index: actualHeat,
                            approved_at: now.toISOString() 
                        })
                        .eq('id', finalCheck.id)
                    console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                    result.created++
                }
            }
            continue
        }

        // 2단계: 수집 건 연결 + 화력 계산
        await linkCollections(tempIssue.id, newsIds, communityIds)
        const actualHeat = await calculateHeatIndex(tempIssue.id).catch(() => 0)
        
        // 3단계: 화력 부족 시 삭제
        if (actualHeat < MIN_HEAT_TO_REGISTER) {
            console.log(`[필터] 화력 부족으로 이슈 삭제: "${representativeTitle}" (화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', tempIssue.id)
            continue
        }
        
        // 4단계: 화력 충분 → 정식 등록 (approval_status 업데이트)
        // 화력 기반 자동 승인 판정
        const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
            AUTO_APPROVE_CATEGORIES.includes(issueCategory)
        
        const approvalStatus = shouldAutoApprove ? '승인' : '대기'
        
        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: approvalStatus,
                approval_type: shouldAutoApprove ? 'auto' : null,
                approval_heat_index: shouldAutoApprove ? actualHeat : null,
                approved_at: shouldAutoApprove ? now.toISOString() : null,
            })
            .eq('id', tempIssue.id)
        
        if (updateError) {
            console.error('이슈 상태 업데이트 에러:', updateError)
            // 실패 시 삭제
            await supabaseAdmin.from('issues').delete().eq('id', tempIssue.id)
            continue
        }

        const createResult = await createNewIssue(
            group,
            representativeTitle,
            newsIds,
            communityIds,
            issueCategory,
            recentCount,
            result,
            now,
            since24h
        )
        if (createResult === 'continue') continue
    }

    return result
}
