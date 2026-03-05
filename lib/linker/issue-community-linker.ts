/**
 * lib/linker/issue-community-linker.ts
 *
 * [이슈-커뮤니티 자동 연결]
 *
 * 수집된 커뮤니티 데이터를 키워드 기반으로 이슈와 자동 연결합니다.
 * community_data.issue_id FK를 직접 UPDATE합니다.
 *
 * 매칭 기준:
 *   - 이슈 제목에서 불용어를 제거한 핵심 키워드 추출
 *   - 커뮤니티 글 제목을 단어 단위로 분리 후 정확 일치 비교 (includes 부분 매칭 제거)
 *   - 키워드의 60% 이상(ceil) + 최소 2개가 일치해야 연결
 *   - 이슈 생성일 기준 전후 N일 이내 작성된 글만 대상 (날짜 범위 필터)
 *
 * 재검증:
 *   - 이미 연결된 커뮤니티 글도 매 cron 주기마다 기준을 재검증
 *   - 기준 미달(키워드 불일치 또는 날짜 범위 초과)이면 issue_id를 null로 해제
 */

import { supabaseAdmin } from '@/lib/supabase/server'

interface LinkResult {
    issueId: string
    issueTitle: string
    linkedCount: number
    unlinkedCount: number
}

// 이슈 생성일 기준 커뮤니티 글 수집 날짜 범위 (환경변수로 조정 가능)
const BEFORE_DAYS = parseInt(process.env.LINKER_COMMUNITY_BEFORE_DAYS ?? '1')
const AFTER_DAYS = parseInt(process.env.LINKER_COMMUNITY_AFTER_DAYS ?? '7')

// 뉴스 기사·커뮤니티 제목에 자주 등장하지만 이슈 식별에 무의미한 단어
const STOPWORDS = new Set([
    '논란', '사건', '사고', '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급', '오늘', '어제',
    '지금', '올해', '최근', '현재', '직접', '처음', '마지막', '드디어',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
    // 방향/위치 관련 범용어 추가
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    // 모집/참여 관련 범용어
    '모집', '참여', '신청', '접수', '지원', '선발',
])

/**
 * stripMediaPrefix - 언론 접두어 제거
 */
function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

// 1글자이지만 중요한 의미를 가져서 필터링하면 안 되는 예외 키워드
const ALLOWED_ONE_CHAR_KEYWORDS = new Set([
    '환', '뷔', '진', '첸', '츄', '뱀', '윤', '문', '안', '정', '이', '박', '김', '최',
    '권', '조', '강', '류', '홍', '송', '백', '유', '오', '신', '양', '황', '허', '고',
    '설', '선', '길', '표', '명', '범', '혁', '훈', '빈', '결', '률', '현', '린'
])

/**
 * extractKeywords - 제목에서 핵심 키워드 추출
 *
 * 언론 접두어 제거 → 특수문자 제거 → 공백 분리 → 2글자 미만 제거(예외 허용) → 불용어 제거
 */
function extractKeywords(text: string): string[] {
    return Array.from(new Set(
        stripMediaPrefix(text)
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => (w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w)) && !STOPWORDS.has(w))
    ))
}

/**
 * extractTitleWords - 커뮤니티 글 제목을 단어 Set으로 변환
 *
 * includes() 부분 매칭 대신 단어 단위 정확 일치 비교를 위해 사용.
 * 예: "이재민 구호" → Set(["이재민", "구호"]) → "이재" 키워드와 매칭 안 됨
 */
function extractTitleWords(text: string): Set<string> {
    return new Set(
        text
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w))
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
 * isMatch - 커뮤니티 글 제목이 이슈 키워드 기준을 통과하는지 판단
 */
function isMatch(title: string, keywordsLower: string[], threshold: number): boolean {
    const titleWords = extractTitleWords(title)
    const matchCount = keywordsLower.filter((kw) => titleWords.has(kw)).length
    return matchCount >= threshold
}

async function linkCommunityToIssue(
    issueId: string,
    issueTitle: string,
    issueCreatedAt: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    if (keywords.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const { from, to } = buildDateRange(issueCreatedAt)

    /*
     * threshold: 키워드 수의 60%(ceil), 최소 2개·최대 5개.
     * 
     * 기존 40%는 너무 느슨해서 무관한 커뮤니티 글이 많이 연결됨.
     * 60%로 상향 + 최대값을 3→5로 증가하여 긴 제목도 정확하게 매칭.
     */
    const threshold = Math.min(5, Math.max(2, Math.ceil(keywordsLower.length * 0.6)))

    /* 아직 이슈에 연결되지 않은 커뮤니티 글 중 날짜 범위 내 500건 조회 */
    const { data: community } = await supabaseAdmin
        .from('community_data')
        .select('id, title')
        .is('issue_id', null)
        .gte('written_at', from)
        .lte('written_at', to)
        .order('written_at', { ascending: false })
        .limit(500)

    if (!community || community.length === 0) return 0

    const matchedIds = community
        .filter((item) => isMatch(item.title, keywordsLower, threshold))
        .slice(0, 20)
        .map((item) => item.id)

    if (matchedIds.length === 0) return 0

    const { error } = await supabaseAdmin
        .from('community_data')
        .update({ issue_id: issueId })
        .in('id', matchedIds)

    if (error) {
        console.error(`이슈 ${issueId} 커뮤니티 연결 에러:`, error)
        return 0
    }

    return matchedIds.length
}

/**
 * unlinkInvalidCommunity - 이미 연결된 커뮤니티 글 중 기준 미달을 해제
 *
 * 매칭 기준(키워드 임계값 또는 날짜 범위)을 충족하지 못하는 연결 건의
 * issue_id를 null로 초기화합니다.
 */
async function unlinkInvalidCommunity(
    issueId: string,
    issueTitle: string,
    issueCreatedAt: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    const { from, to } = buildDateRange(issueCreatedAt)

    /* 해당 이슈에 연결된 커뮤니티 글 전체 조회 */
    const { data: linked } = await supabaseAdmin
        .from('community_data')
        .select('id, title, written_at')
        .eq('issue_id', issueId)

    if (!linked || linked.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const threshold = Math.min(5, Math.max(2, Math.ceil(keywordsLower.length * 0.6)))

    const invalidIds = linked
        .filter((item) => {
            // 날짜 범위 초과
            if (item.written_at < from || item.written_at > to) return true
            // 키워드 기준 미달 (키워드가 없는 이슈는 전부 해제)
            if (keywords.length === 0) return true
            return !isMatch(item.title, keywordsLower, threshold)
        })
        .map((item) => item.id)

    if (invalidIds.length === 0) return 0

    const { error } = await supabaseAdmin
        .from('community_data')
        .update({ issue_id: null })
        .in('id', invalidIds)

    if (error) {
        console.error(`이슈 ${issueId} 커뮤니티 연결 해제 에러:`, error)
        return 0
    }

    return invalidIds.length
}

export async function linkAllCommunityToIssues(): Promise<LinkResult[]> {
    /*
     * 승인·대기 이슈: 새 커뮤니티 글 연결 + 기존 연결 재검증
     * 반려 이슈: 새 커뮤니티 글 연결 안 함, 기존 잘못된 연결만 정리 (데이터 정합성 유지)
     * 
     * 대기 이슈도 포함: 승인 전에도 커뮤니티가 연결되어야 화력 재계산에 반영됨.
     * 대기 상태에서 커뮤니티 반응이 누락되면 화력이 낮게 유지되어 자동 반려되는 악순환 방지.
     */
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, created_at, approval_status')
        .in('approval_status', ['승인', '대기', '반려'])
        .order('updated_at', { ascending: false })
        .limit(100)

    if (!issues || issues.length === 0) return []

    const results: LinkResult[] = []

    for (const issue of issues) {
        // 반려된 이슈는 새 커뮤니티 글 연결하지 않고, 기존 잘못된 연결만 정리
        const isRejected = issue.approval_status === '반려'
        
        const [linkedCount, unlinkedCount] = await Promise.all([
            isRejected ? Promise.resolve(0) : linkCommunityToIssue(issue.id, issue.title, issue.created_at),
            unlinkInvalidCommunity(issue.id, issue.title, issue.created_at),
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
