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
import { extractKeywords, buildDateRange, isMatch } from './linker-utils'

interface LinkResult {
    issueId: string
    issueTitle: string
    linkedCount: number
    unlinkedCount: number
    protected?: boolean
}

// 이슈 생성일 기준 커뮤니티 글 수집 날짜 범위 (환경변수로 조정 가능)
const BEFORE_DAYS = parseInt(process.env.LINKER_COMMUNITY_BEFORE_DAYS ?? '1')
const AFTER_DAYS = parseInt(process.env.LINKER_COMMUNITY_AFTER_DAYS ?? '7')

// 대량 해제 보호 임계값 (기본 3, 0으로 설정 시 보호 비활성화)
const LINKER_MIN_LINKED_TO_PROTECT = parseInt(
    process.env.LINKER_MIN_LINKED_TO_PROTECT ?? '3'
)

// 대량 해제 보호 비율 (기본 0.7 = 70% 이상 해제 시 경고, 1.0으로 설정 시 보호 비활성화)
const LINKER_PROTECT_RATIO = parseFloat(
    process.env.LINKER_PROTECT_RATIO ?? '0.7'
)

async function linkCommunityToIssue(
    issueId: string,
    issueTitle: string,
    issueCreatedAt: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    if (keywords.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const { from, to } = buildDateRange(issueCreatedAt, BEFORE_DAYS, AFTER_DAYS)

    /*
     * threshold: 키워드 수의 70%(ceil), 최소 3개·최대 5개.
     * 
     * 기존 60%는 "김연경" 같은 인물명 1개 키워드만으로도 
     * 무관한 커뮤니티 글이 연결되는 문제 발생.
     * 70%로 상향 + 최소값을 2→3으로 증가하여 정확도 강화.
     * 
     * 예시:
     * - 3개 키워드 → 3개 (100% → 최소값 적용)
     * - 4개 키워드 → 3개 (75%)
     * - 5개 키워드 → 4개 (80%)
     * - 7개 키워드 → 5개 (71%)
     * - 10개 키워드 → 5개 (50% → 최대값 적용)
     */
    const threshold = Math.min(5, Math.max(3, Math.ceil(keywordsLower.length * 0.7)))
    
    // 인물명 키워드가 포함된 경우 최소 임계값 상향 (오연결 방지)
    const personKeywords = ['김연경', '손흥민', '이강인', '옥택연', '민희진', '뉴진스', 
                           '윤석열', '이재명', '한동훈', '황희찬', '김하성', '류현진']
    const hasPersonKeyword = keywordsLower.some(k => personKeywords.includes(k))
    const adjustedThreshold = hasPersonKeyword ? Math.max(threshold, 3) : threshold

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
        .filter((item) => isMatch(item.title, keywordsLower, adjustedThreshold))
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
    const { from, to } = buildDateRange(issueCreatedAt, BEFORE_DAYS, AFTER_DAYS)

    /* 해당 이슈에 연결된 커뮤니티 글 전체 조회 */
    const { data: linked } = await supabaseAdmin
        .from('community_data')
        .select('id, title, written_at')
        .eq('issue_id', issueId)

    if (!linked || linked.length === 0) return 0

    const keywordsLower = keywords.map((k) => k.toLowerCase())
    const threshold = Math.min(5, Math.max(3, Math.ceil(keywordsLower.length * 0.7)))
    
    // 인물명 키워드가 포함된 경우 최소 임계값 상향 (오연결 방지)
    const personKeywords = ['김연경', '손흥민', '이강인', '옥택연', '민희진', '뉴진스', 
                           '윤석열', '이재명', '한동훈', '황희찬', '김하성', '류현진']
    const hasPersonKeyword = keywordsLower.some(k => personKeywords.includes(k))
    const adjustedThreshold = hasPersonKeyword ? Math.max(threshold, 3) : threshold

    const invalidIds = linked
        .filter((item) => {
            // 날짜 범위 초과
            if (item.written_at < from || item.written_at > to) return true
            // 키워드 기준 미달 (키워드가 없는 이슈는 전부 해제)
            if (keywords.length === 0) return true
            return !isMatch(item.title, keywordsLower, adjustedThreshold)
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
        .limit(50)

    if (!issues || issues.length === 0) return []

    const results: LinkResult[] = []

    for (const issue of issues) {
        // 반려된 이슈는 새 커뮤니티 글 연결하지 않고, 기존 잘못된 연결만 정리
        const isRejected = issue.approval_status === '반려'
        
        // 현재 연결된 커뮤니티 글 건수 조회 (대량 해제 보호 판단용)
        const { count: currentLinkedCount } = await supabaseAdmin
            .from('community_data')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', issue.id)
        
        const [linkedCount, unlinkedCount] = await Promise.all([
            isRejected ? Promise.resolve(0) : linkCommunityToIssue(issue.id, issue.title, issue.created_at),
            unlinkInvalidCommunity(issue.id, issue.title, issue.created_at),
        ])

        // 대량 해제 감지 및 보호 (조건부)
        const shouldProtect = 
            LINKER_MIN_LINKED_TO_PROTECT > 0 &&
            LINKER_PROTECT_RATIO < 1.0 &&
            currentLinkedCount !== null &&
            currentLinkedCount >= LINKER_MIN_LINKED_TO_PROTECT &&
            unlinkedCount > currentLinkedCount * LINKER_PROTECT_RATIO

        if (shouldProtect) {
            const ratio = ((unlinkedCount / currentLinkedCount) * 100).toFixed(1)
            console.warn(`⚠️ [linker 보호] 대량 해제 차단 - ${issue.title}`, {
                issueId: issue.id,
                현재연결: currentLinkedCount,
                해제시도: unlinkedCount,
                해제비율: `${ratio}%`,
                보호임계값: `${(LINKER_PROTECT_RATIO * 100).toFixed(0)}%`,
                권장조치: '환경변수 LINKER_PROTECT_RATIO를 1.0으로 설정하여 비활성화하거나, 로직 확인 필요',
            })
            
            results.push({
                issueId: issue.id,
                issueTitle: issue.title,
                linkedCount,
                unlinkedCount: 0,
                protected: true,
            })
            continue
        }

        // 대량 해제 경고 (보호하지는 않음)
        if (
            currentLinkedCount !== null &&
            currentLinkedCount >= 3 &&
            unlinkedCount > currentLinkedCount * 0.5
        ) {
            const ratio = ((unlinkedCount / currentLinkedCount) * 100).toFixed(1)
            console.warn(`📊 [linker 경고] 대량 해제 감지 - ${issue.title}`, {
                issueId: issue.id,
                현재연결: currentLinkedCount,
                해제건수: unlinkedCount,
                해제비율: `${ratio}%`,
                새연결: linkedCount,
            })
        }

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
