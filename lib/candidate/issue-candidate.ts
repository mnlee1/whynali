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
 *   1. 커뮤니티 반응 ≥ 1건 + 최근 3시간 건수 ≥ 5건 + 고유 출처 ≥ 2곳: approval_status='대기'로 등록 + 알람 반환
 *   2. 위 조건 충족 + 최근 3시간 건수 ≥ 10건 + 최초 수집 건이 N시간 이전: 자동 승인
 *   3. 같은 제목이 최근 24시간 내 이미 등록된 경우 중복 등록 방지
 *
 * 임계값은 환경변수로 조정 가능:
 *   CANDIDATE_ALERT_THRESHOLD (기본 3)
 *   CANDIDATE_AUTO_APPROVE_THRESHOLD (기본 5)
 *   CANDIDATE_NO_RESPONSE_HOURS (기본 6)
 *   CANDIDATE_WINDOW_HOURS (기본 3) — 건수 집계 시간 창
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import type { IssueCategory } from '@/types/issue'

const ALERT_THRESHOLD = parseInt(process.env.CANDIDATE_ALERT_THRESHOLD ?? '5')
const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '10')
const NO_RESPONSE_HOURS = parseInt(process.env.CANDIDATE_NO_RESPONSE_HOURS ?? '6')
/* 건수 집계 시간 창 (시간 단위). 기본 3시간 */
const WINDOW_HOURS = parseInt(process.env.CANDIDATE_WINDOW_HOURS ?? '3')
/* 대기 등록을 위한 최소 고유 출처 수. 같은 언론사의 반복 배포를 걸러낸다 */
const MIN_UNIQUE_SOURCES = parseInt(process.env.CANDIDATE_MIN_UNIQUE_SOURCES ?? '2')
/* 이슈 등록 후 화력이 이 값 미만이면 자동 반려 처리 (관리자 목록에 노출 안 됨) */
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')
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
    title: string         // 후보 대표 제목 (첫 번째 수집 건)
    count: number         // 집계 창(기본 3시간) 내 건수
    newsCount: number
    communityCount: number
}

export interface CandidateResult {
    created: number                  // 자동 승인된 이슈 수
    alerts: CandidateAlert[]         // 대기 등록된 후보 목록 (관리자 배너용)
    evaluated: number                // 평가된 전체 후보 수
}

/**
 * stripMediaPrefix - 언론 접두어 제거
 *
 * 뉴스 기사 제목 앞의 [단독], [속보], [해외연예] 같은 언론사 형식 접두어를 제거한다.
 * 이 접두어가 이슈 제목에 남아 있으면 토큰을 오염시켜 threshold를 불필요하게 높인다.
 *
 * 예시:
 *   "[해외연예] 조로사, 팔로워 1억 돌파" → "조로사, 팔로워 1억 돌파"
 *   "[단독][속보] 이재명 대선 출마" → "이재명 대선 출마"
 */
function stripMediaPrefix(title: string): string {
    return title
        .replace(/^(\[[^\]]{1,30}\]\s*)+/, '')
        .trim()
}

/**
 * selectRepresentativeTitle - 그룹 내 대표 제목 선택
 *
 * 접두어 제거 후 가장 짧은 제목을 대표로 선택한다.
 * 길고 수식어 많은 제목 대신 핵심만 있는 제목을 이슈 title로 쓰기 위함.
 * 길이가 같으면 첫 번째 아이템 우선.
 */
function selectRepresentativeTitle(items: RawItem[]): string {
    return items
        .map((i) => stripMediaPrefix(i.title))
        .reduce((shortest, cur) => cur.length < shortest.length ? cur : shortest)
}

/**
 * tokenize - 제목을 키워드 배열로 분리
 *
 * 특수문자 제거 후 공백 기준 분리, 2글자 미만 제거.
 */
function tokenize(text: string): string[] {
    const words = text
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    return Array.from(new Set(words))
}

/**
 * commonKeywordCount - 두 토큰 배열의 공통 키워드 수 반환
 */
function commonKeywordCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((w) => w.toLowerCase()))
    return a.filter((w) => setB.has(w.toLowerCase())).length
}

/**
 * groupItems - 수집 건을 키워드 기반으로 후보 그룹으로 묶음
 *
 * 공통 키워드 1개 이상이면 같은 후보로 판단.
 * ≥2 기준은 "장동혁 대표 비판" vs "장동혁 절윤 거부"처럼 같은 인물 이슈가
 * 다른 그룹으로 쪼개지는 현상이 발생하여 ≥1로 완화.
 * 노이즈 방지는 ALERT_THRESHOLD(기본 5건)와 고유 출처 조건으로 대응.
 *
 * 주의: 그룹 tokens를 합집합으로 갱신하지 않는다.
 * 합집합 방식은 뉴스A→B→C 순서로 각 1개씩 공통이면 A와 C가 무관해도 같은 그룹이 되는
 * 연쇄 그루핑(chaining) 문제를 일으킨다.
 * 그룹의 기준 토큰은 첫 번째 아이템으로 고정해 이를 방지한다.
 */
function groupItems(items: RawItem[]): CandidateGroup[] {
    const groups: CandidateGroup[] = []

    for (const item of items) {
        const tokens = tokenize(item.title)
        let matched = false

        for (const group of groups) {
            if (commonKeywordCount(tokens, group.tokens) >= 1) {
                group.items.push(item)
                // 토큰을 합집합으로 갱신하지 않음 — 연쇄 그루핑 방지
                matched = true
                break
            }
        }

        if (!matched) {
            groups.push({ tokens, items: [item] })
        }
    }

    return groups
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
 * CATEGORY_KEYWORDS - 카테고리별 제목 키워드 사전
 *
 * 제목에서 이 키워드가 몇 개 매칭되는지 스코어링해 카테고리를 결정한다.
 * 키워드 추가/수정으로 분류 정확도를 조정할 수 있다.
 */
const CATEGORY_KEYWORDS: Record<IssueCategory, string[]> = {
    연예: [
        '배우', '가수', '아이돌', '드라마', '영화', '방송', '예능', '팬', '연기',
        '뮤직비디오', '콘서트', '공연', '데뷔', '컴백', '연예인', '스타', '오디션',
        '활동', 'SM', 'JYP', 'HYBE', '걸그룹', '보이그룹', '솔로', '앨범', '뮤지컬',
        '소속사', '매니저', '스캔들', '열애', '결혼', '이혼', '임신', '은퇴',
    ],
    스포츠: [
        '야구', '축구', '농구', '배구', '선수', '감독', '경기', '우승', '리그',
        '득점', '올림픽', '월드컵', '체육', '코치', '트레이드', '시즌', '챔피언',
        '골', '타자', '투수', '수비', '공격', '패', '승', '골키퍼', '에이전트',
        '구단', '팀', '스포츠', '육상', '수영', '탁구', '테니스', '골프',
    ],
    정치: [
        '대통령', '국회', '정당', '여당', '야당', '선거', '의원', '장관',
        '탄핵', '법안', '총리', '내각', '청와대', '국무', '정치', '당대표',
        '정책', '입법', '개헌', '헌법', '투표', '공천', '후보', '정부',
        '여론', '국정', '국방', '외교', '통일', '안보',
    ],
    사회: [
        '사건', '사망', '부상', '화재', '범죄', '경찰', '검찰', '재판',
        '피해', '시위', '갈등', '체포', '수사', '실종', '사고', '폭행',
        '성범죄', '마약', '사기', '횡령', '뇌물', '비리', '논란', '항의',
        '파업', '시위대', '집회', '조사', '구속', '기소', '판결',
    ],
    기술: [
        'AI', '인공지능', '반도체', '스마트폰', '앱', '플랫폼', '스타트업',
        '구글', '애플', '메타', '삼성전자', 'LG전자', 'SK하이닉스', '소프트웨어',
        '클라우드', '데이터', '사이버', '해킹', '개발자', '코딩', '로봇',
        '드론', '자율주행', '전기차', '배터리', '디지털', '서비스', '유튜브',
    ],
}

/**
 * inferCategory - 그룹 내 제목 키워드 스코어링으로 카테고리 결정
 *
 * 1차: 전체 제목을 합산해 카테고리별 키워드 매칭 수를 점수화 → 가장 높은 카테고리 선택.
 * 2차(폴백): 키워드 매칭 점수가 모두 0이면 수집 카테고리 다수결 사용.
 * 3차(폴백): 수집 카테고리도 없으면 '사회' 기본값 사용.
 */
function inferCategory(items: RawItem[]): IssueCategory {
    const validCategories: IssueCategory[] = ['연예', '스포츠', '정치', '사회', '기술']
    const allTitles = items.map((i) => i.title).join(' ')

    const scores = validCategories.reduce<Record<IssueCategory, number>>(
        (acc, cat) => {
            acc[cat] = CATEGORY_KEYWORDS[cat].filter((kw) => allTitles.includes(kw)).length
            return acc
        },
        { 연예: 0, 스포츠: 0, 정치: 0, 사회: 0, 기술: 0 }
    )

    const topByKeyword = (Object.entries(scores) as [IssueCategory, number][])
        .sort((a, b) => b[1] - a[1])[0]

    if (topByKeyword[1] > 0) return topByKeyword[0]

    // 키워드 매칭 없음 → 수집 카테고리 다수결 폴백
    const categoryCounts = items
        .filter((i) => i.category !== null)
        .reduce<Record<string, number>>((acc, i) => {
            const cat = i.category as string
            acc[cat] = (acc[cat] ?? 0) + 1
            return acc
        }, {})

    const top = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '사회'
    const candidate = top as IssueCategory

    return validCategories.includes(candidate) ? candidate : '사회'
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

    // 커뮤니티 토큰 목록: 각 글의 토큰 배열 + id 보관
    const communityTokenList = (communityItems ?? []).map((c) => ({
        id: c.id,
        tokens: tokenize(c.title),
    }))

    const groups = groupItems(newsRawItems)
    const result: CandidateResult = { created: 0, alerts: [], evaluated: groups.length }

    for (const group of groups) {
        // 그루핑 대상이 이미 집계 창 내 데이터이므로 그룹 전체 건수가 곧 집계 건수
        const recentCount = group.items.length

        if (recentCount < ALERT_THRESHOLD) continue

        // 고유 출처 수 필터: 같은 언론사의 반복 배포(보도자료 신디케이션) 방지
        // community 아이템은 source가 null이므로 news만 집계
        const uniqueSources = new Set(
            group.items
                .filter((i) => i.type === 'news' && i.source)
                .map((i) => i.source as string)
        ).size
        // 뉴스가 하나라도 있을 때만 출처 다양성 체크. 커뮤니티 전용 그룹은 통과
        const hasNews = group.items.some((i) => i.type === 'news')
        if (hasNews && uniqueSources < MIN_UNIQUE_SOURCES) continue

        // 접두어 제거 후 그룹 내 가장 짧은 제목을 대표 제목으로 선택
        const representativeTitle = selectRepresentativeTitle(group.items)

        /*
         * 커뮤니티 반응 체크 (키워드 매칭 방식, 가산점 역할):
         * representativeTitle에서 추출한 tokens로 비교.
         * group.tokens(합집합) 사용 시 연쇄 그루핑으로 tokens가 불어나
         * 관련 없는 커뮤니티 글까지 끌어들이는 문제 방지.
         * 매칭 0건이어도 이슈 등록은 허용 (필수 조건 아님). 화력이 낮은 이슈는 관리자가 판단.
         * (더쿠·네이트판은 연예·일상 위주라 정치·사회 뉴스 매칭이 구조적으로 어려움 — 07 §6.3 참조)
         */
        const representativeTokens = tokenize(representativeTitle)
        const matchedCommunityIds = communityTokenList
            .filter((c) => commonKeywordCount(c.tokens, representativeTokens) >= COMMUNITY_MATCH_THRESHOLD)
            .map((c) => c.id)
        const firstSeenAt = group.items[0].created_at
        // 그룹 아이템은 뉴스만 포함됨. 커뮤니티는 키워드 매칭으로 별도 수집한 matchedCommunityIds 사용
        const newsIds = group.items.map((i) => i.id)
        const communityIds = matchedCommunityIds
        const issueCategory = inferCategory(group.items)

        // 자동 승인 조건: 8건 이상 + 최초 수집 건이 N시간 이전
        const shouldAutoApprove =
            recentCount >= AUTO_APPROVE_THRESHOLD && firstSeenAt <= noResponseCutoff

        // 최근 24시간 내 같은 제목 이슈 존재 여부 확인 (중복 등록 방지)
        const { data: existingIssues } = await supabaseAdmin
            .from('issues')
            .select('id, approval_status')
            .eq('title', representativeTitle)
            .gte('created_at', since24h)
            .limit(1)

        const existingIssue = existingIssues?.[0] ?? null

        if (existingIssue) {
            if (existingIssue.approval_status === '대기') {
                if (shouldAutoApprove) {
                    // 기존 대기 이슈를 자동 승인으로 업데이트
                    const { error: updateError } = await supabaseAdmin
                        .from('issues')
                        .update({ approval_status: '승인', approved_at: now.toISOString() })
                        .eq('id', existingIssue.id)

                    if (!updateError) {
                        // 아직 연결 안 된 수집 건 추가 연결 후 화력 재계산
                        await linkCollections(existingIssue.id, newsIds, communityIds)
                        await calculateHeatIndex(existingIssue.id).catch(() => {/* 화력 계산 실패는 등록 자체를 막지 않음 */})
                        result.created++
                    }
                } else {
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
        const approvalStatus = shouldAutoApprove ? '승인' : '대기'

        const { data: newIssue, error: issueError } = await supabaseAdmin
            .from('issues')
            .insert({
                title: representativeTitle,
                description: null,
                status: '점화',
                category: issueCategory,
                approval_status: approvalStatus,
                approved_at: shouldAutoApprove ? now.toISOString() : null,
            })
            .select('id')
            .single()

        if (issueError || !newIssue) {
            console.error('이슈 자동 등록 에러:', issueError)
            continue
        }

        // 수집 건에 issue_id 연결 후 화력 즉시 계산 (대기·승인 모두)
        await linkCollections(newIssue.id, newsIds, communityIds)
        const heatIndex = await calculateHeatIndex(newIssue.id).catch(() => 0)

        /*
         * 화력 최소값 필터: MIN_HEAT_TO_REGISTER(기본 10점) 미만이면 자동 반려.
         * 뉴스·커뮤니티 반응 모두 미약한 이슈가 관리자 대기 목록에 올라오지 않도록 차단.
         * 이슈는 DB에 남지만 approval_status='반려'로 전환되어 목록에 노출되지 않는다.
         */
        if (heatIndex < MIN_HEAT_TO_REGISTER) {
            await supabaseAdmin
                .from('issues')
                .update({ approval_status: '반려' })
                .eq('id', newIssue.id)
            continue
        }

        if (shouldAutoApprove) {
            result.created++
        } else {
            // 대기 등록 → 배너 알람 목록에 추가
            result.alerts.push({
                title: representativeTitle,
                count: recentCount,
                newsCount: newsIds.length,
                communityCount: communityIds.length,
            })
        }
    }

    return result
}
