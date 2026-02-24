/**
 * lib/linker/issue-news-linker.ts
 *
 * [이슈-뉴스 자동 연결]
 *
 * 수집된 뉴스를 키워드 기반으로 이슈와 자동 연결합니다.
 * news_data.issue_id FK를 직접 UPDATE합니다.
 *
 * 매칭 기준:
 *   - 이슈 카테고리와 동일한 뉴스만 대상 (카테고리 필터 — 다른 주제 오연결 방지)
 *   - 이슈 제목에서 불용어를 제거한 핵심 키워드 추출
 *   - 뉴스 제목을 단어 단위로 분리 후 정확 일치 비교 (includes 부분 매칭 제거)
 *   - 키워드의 60% 이상(ceil) + 최소 2개가 일치해야 연결
 *   - 이슈 생성일 기준 전후 N일 이내 수집된 뉴스만 대상 (날짜 범위 필터)
 *
 * 재검증:
 *   - 이미 연결된 뉴스도 매 cron 주기마다 기준을 재검증
 *   - 기준 미달(키워드 불일치, 날짜 범위 초과, 카테고리 불일치)이면 issue_id를 null로 해제
 */

import { supabaseAdmin } from '@/lib/supabase/server'

interface LinkResult {
    issueId: string
    issueTitle: string
    linkedCount: number
    unlinkedCount: number
}

// 이슈 생성일 기준 뉴스 수집 날짜 범위 (환경변수로 조정 가능)
// 전후 3일은 같은 인물의 다른 사건 뉴스까지 끌어오는 원인이었음 → 전 1일/후 2일로 축소
const BEFORE_DAYS = parseInt(process.env.LINKER_NEWS_BEFORE_DAYS ?? '1')
const AFTER_DAYS = parseInt(process.env.LINKER_NEWS_AFTER_DAYS ?? '2')

// 뉴스 기사·커뮤니티 제목에 자주 등장하지만 이슈 식별에 무의미한 단어
const STOPWORDS = new Set([
    '논란', '사건', '사고', '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급', '오늘', '어제',
    '지금', '올해', '최근', '현재', '직접', '처음', '마지막', '드디어',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
])

/**
 * extractKeywords - 제목에서 핵심 키워드 추출
 *
 * 특수문자 제거 → 공백 분리 → 2글자 미만 제거 → 불용어 제거
 */
function extractKeywords(text: string): string[] {
    return Array.from(new Set(
        text
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    ))
}

/**
 * extractTitleWords - 뉴스 제목을 단어 Set으로 변환
 *
 * includes() 부분 매칭 대신 단어 단위 정확 일치 비교를 위해 사용.
 * 예: "이재민 구호" → Set(["이재민", "구호"]) → "이재" 키워드와 매칭 안 됨
 */
function extractTitleWords(text: string): Set<string> {
    return new Set(
        text
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .map((w) => w.toLowerCase())
    )
}

/**
 * buildDateRange - 이슈 생성일 기준 날짜 범위 반환
 */
function buildDateRange(issueCreatedAt: string): { from: string; to: string } {
    const issueDt = new Date(issueCreatedAt)
    return {
        from: new Date(issueDt.getTime() - BEFORE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(issueDt.getTime() + AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }
}

/**
 * isMatch - 뉴스 제목이 이슈 키워드 기준을 통과하는지 판단
 */
function isMatch(title: string, keywordsLower: string[], threshold: number): boolean {
    const titleWords = extractTitleWords(title)
    const matchCount = keywordsLower.filter((kw) => titleWords.has(kw)).length
    return matchCount >= threshold
}

async function linkNewsToIssue(
    issueId: string,
    issueTitle: string,
    issueCreatedAt: string,
    issueCategory: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    if (keywords.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const { from, to } = buildDateRange(issueCreatedAt)

    /*
     * threshold: 키워드 60%(ceil) 이상 + 최소 2개 일치해야 연결.
     * 기존 50%+floor에서 강화 — 4개 키워드 기준 3개(75%)로 상향.
     */
    const threshold = Math.max(2, Math.ceil(keywordsLower.length * 0.6))

    /*
     * 아직 이슈에 연결되지 않은 뉴스 중 날짜 범위 내 500건 조회.
     * category가 설정된 경우: 동일 카테고리 뉴스만 대상 (오연결 방지)
     * category가 null인 경우: 마이그레이션 이전 수집 건 — 제외하지 않고 포함하여
     *   키워드 매칭 단계에서 관련성으로 판단.
     */
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title')
        .is('issue_id', null)
        .or(`category.eq.${issueCategory},category.is.null`)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500)

    if (!news || news.length === 0) return 0

    const matchedIds = news
        .filter((item) => isMatch(item.title, keywordsLower, threshold))
        .slice(0, 20)
        .map((item) => item.id)

    if (matchedIds.length === 0) return 0

    const { error } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: issueId })
        .in('id', matchedIds)

    if (error) {
        console.error(`이슈 ${issueId} 뉴스 연결 에러:`, error)
        return 0
    }

    return matchedIds.length
}

/**
 * unlinkInvalidNews - 이미 연결된 뉴스 중 기준 미달을 해제
 *
 * 매칭 기준(키워드 임계값, 날짜 범위, 카테고리 불일치)을 충족하지 못하는 연결 건의
 * issue_id를 null로 초기화합니다.
 */
async function unlinkInvalidNews(
    issueId: string,
    issueTitle: string,
    issueCreatedAt: string,
    issueCategory: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    const { from, to } = buildDateRange(issueCreatedAt)

    /* 해당 이슈에 연결된 뉴스 전체 조회 (카테고리 포함) */
    const { data: linked } = await supabaseAdmin
        .from('news_data')
        .select('id, title, created_at, category')
        .eq('issue_id', issueId)

    if (!linked || linked.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const threshold = Math.max(2, Math.ceil(keywordsLower.length * 0.6))

    const invalidIds = linked
        .filter((item) => {
            // 카테고리 불일치 — 다른 카테고리 뉴스는 즉시 해제
            if (item.category && item.category !== issueCategory) return true
            // 날짜 범위 초과
            if (item.created_at < from || item.created_at > to) return true
            // 키워드 기준 미달 (키워드가 없는 이슈는 전부 해제)
            if (keywords.length === 0) return true
            return !isMatch(item.title, keywordsLower, threshold)
        })
        .map((item) => item.id)

    if (invalidIds.length === 0) return 0

    const { error } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: null })
        .in('id', invalidIds)

    if (error) {
        console.error(`이슈 ${issueId} 뉴스 연결 해제 에러:`, error)
        return 0
    }

    return invalidIds.length
}

/**
 * 모든 승인·대기 이슈에 뉴스 자동 연결 + 기존 연결 재검증
 *
 * 대기 이슈도 포함: 승인 전에도 뉴스가 연결되어야 화력 재계산에 반영됨.
 * 대기 상태에서 뉴스 반응이 누락되면 화력이 낮게 유지되어 자동 반려되는 악순환 방지.
 */
export async function linkAllNewsToIssues(): Promise<LinkResult[]> {
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, created_at, category')
        .in('approval_status', ['승인', '대기'])
        .order('updated_at', { ascending: false })
        .limit(50)

    if (!issues || issues.length === 0) return []

    const results: LinkResult[] = []

    for (const issue of issues) {
        const category = issue.category ?? '사회'
        const [linkedCount, unlinkedCount] = await Promise.all([
            linkNewsToIssue(issue.id, issue.title, issue.created_at, category),
            unlinkInvalidNews(issue.id, issue.title, issue.created_at, category),
        ])

        if (linkedCount > 0 || unlinkedCount > 0) {
            results.push({
                issueId: issue.id,
                issueTitle: issue.title,
                linkedCount,
                unlinkedCount,
            })
        }
    }

    return results
}
