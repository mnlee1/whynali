import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * lib/analysis/heat.ts
 *
 * [이슈 화력 지수 계산]
 *
 * 07_이슈등록_화력_정렬_규격.md §2.3 참조.
 * community_heat(0–100) + news_credibility(0–100) → heat_index(0–100).
 *
 * 가중치 전략:
 *   - community_data 있음: communityHeat × 0.6 + newsCredibility × 0.4
 *   - community_data 없음: heat = newsCredibility × 0.3 (최대 30점)
 *     커뮤니티 반응이 화력을 점화하는 구조 — §6.4 참조
 * 
 * 시간 가중치 적용 (2026-03-11, 2026-03-23 개선):
 *   - 최근 7일 데이터: 가중치 1.0 (100%)
 *   - 30일 이상 데이터: 가중치 0 (완전 소멸, 기존 0.1 → 0)
 *   - 7-30일 사이: 선형 감소
 *   - 정규화: 총합 → 포스트당 평균 (고조회수 인기글의 cap 고착 방지)
 *   - UI 표시용 화력으로 실시간성 반영
 */
export async function calculateHeatIndex(issueId: string): Promise<number> {
    const [communityResult, newsResult] = await Promise.all([
        supabaseAdmin
            .from('community_data')
            .select('view_count, comment_count, created_at')
            .eq('issue_id', issueId),
        supabaseAdmin
            .from('news_data')
            .select('source, created_at')
            .eq('issue_id', issueId),
    ])

    if (communityResult.error) throw communityResult.error
    if (newsResult.error) throw newsResult.error

    const communityData = communityResult.data ?? []
    const newsData = newsResult.data ?? []

    // 시간 가중치 함수
    function getTimeWeight(createdAt: string): number {
        const age = Date.now() - new Date(createdAt).getTime()
        const daysSinceCreated = age / (1000 * 60 * 60 * 24)

        // 선형 감소: 7일까지 100%, 30일 후 0% (완전 소멸)
        if (daysSinceCreated <= 7) return 1.0
        if (daysSinceCreated >= 30) return 0
        return 1.0 - (daysSinceCreated - 7) / 23
    }

    let communityHeat = 0
    if (communityData.length > 0) {
        // 시간 가중 합산
        let weightedViews = 0
        let weightedComments = 0
        
        for (const item of communityData) {
            const weight = getTimeWeight(item.created_at)
            weightedViews += (item.view_count ?? 0) * weight
            weightedComments += (item.comment_count ?? 0) * weight
        }
        
        // 포스트당 평균으로 정규화: 다수의 고조회수 글이 cap을 계속 유지하는 문제 방지
        const avgWeightedViews = weightedViews / communityData.length
        const avgWeightedComments = weightedComments / communityData.length
        const viewScore = Math.min(100, (avgWeightedViews / 5000) * 100)
        const commentScore = Math.min(100, (avgWeightedComments / 500) * 100)
        const raw = viewScore * 0.35 + commentScore * 0.45
        communityHeat = Math.min(100, Math.max(0, Math.round(raw)))
    }

    let newsCredibility = 0
    if (newsData.length > 0) {
        // 시간 가중 뉴스 건수 및 출처 다양성
        let weightedCount = 0
        const weightedSources = new Map<string, number>()
        
        for (const item of newsData) {
            const weight = getTimeWeight(item.created_at)
            weightedCount += weight
            
            const currentWeight = weightedSources.get(item.source) || 0
            weightedSources.set(item.source, currentWeight + weight)
        }
        
        // 출처 다양성: 각 출처당 최소 1로 계산
        const effectiveSources = Array.from(weightedSources.values())
            .reduce((sum, w) => sum + Math.min(1, w), 0)
        
        const sourceScore = (Math.min(20, effectiveSources) / 20) * 100
        const countScore = Math.min(100, weightedCount * 2)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    /*
     * 화력 = newsCredibility × (0.3 + 0.7 × community_amp)
     *
     * community_amp: 커뮤니티 반응 강도 증폭 계수 (0~1)
     *   - communityHeat ≤ 3: amp=0 (극소량 노이즈만 제거)
     *   - communityHeat > 3: sqrt((communityHeat - 3) / 70) 로 증폭
     *
     * 개선 사항 (2026-02-25):
     *   임계값 10 → 3: 작은 커뮤니티 반응도 인정 (키워드 매칭 1-2건)
     *   증폭 속도 상향: 90 → 70 (반응이 있으면 화력이 더 빨리 상승)
     *   
     * 설계 의도:
     *   커뮤니티 반응이 없으면 최대 30점 → 관리자 검토 필요
     *   작은 반응(조회 1000+, 댓글 50+)도 화력 상승에 기여
     *   큰 반응(조회 5000+, 댓글 300+)은 화력 50-70점대 달성
     */
    const communityAmp = communityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))

    const heatIndex = Math.round(
        Math.min(100, Math.max(0, newsCredibility * (0.3 + 0.7 * communityAmp)))
    )

    const { error } = await supabaseAdmin
        .from('issues')
        .update({
            heat_index: heatIndex,
            updated_at: new Date().toISOString(),
        })
        .eq('id', issueId)

    if (error) throw error

    return heatIndex
}

/**
 * calculateBothHeats - UI용 화력 + 상태 전환용 화력을 DB 조회 1회로 동시 계산
 *
 * recalculate-heat Cron에서 이슈당 4번 발생하던 DB 조회를 2번으로 절감합니다.
 * - heatIndex: 시간 가중치 적용 (UI 표시용 실시간 화력)
 * - recentHeat: 최근 7일 필터만 적용 (상태 전환 판단용 안정 화력)
 *
 * 예시:
 * const { heatIndex, recentHeat } = await calculateBothHeats(issueId)
 */
export async function calculateBothHeats(issueId: string): Promise<{
    heatIndex: number
    recentHeat: number
}> {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [communityResult, newsResult] = await Promise.all([
        supabaseAdmin
            .from('community_data')
            .select('view_count, comment_count, created_at')
            .eq('issue_id', issueId),
        supabaseAdmin
            .from('news_data')
            .select('source, created_at')
            .eq('issue_id', issueId),
    ])

    if (communityResult.error) throw communityResult.error
    if (newsResult.error) throw newsResult.error

    const communityData = communityResult.data ?? []
    const newsData = newsResult.data ?? []

    // 시간 가중치 함수 (calculateHeatIndex와 동일)
    function getTimeWeight(createdAt: string): number {
        const age = Date.now() - new Date(createdAt).getTime()
        const daysSinceCreated = age / (1000 * 60 * 60 * 24)
        if (daysSinceCreated <= 7) return 1.0
        if (daysSinceCreated >= 30) return 0
        return 1.0 - (daysSinceCreated - 7) / 23
    }

    // ── heatIndex 계산 (시간 가중치 적용) ────────────────────────────────────
    let communityHeatWeighted = 0
    if (communityData.length > 0) {
        let weightedViews = 0
        let weightedComments = 0
        for (const item of communityData) {
            const weight = getTimeWeight(item.created_at)
            weightedViews += (item.view_count ?? 0) * weight
            weightedComments += (item.comment_count ?? 0) * weight
        }
        const avgViews = weightedViews / communityData.length
        const avgComments = weightedComments / communityData.length
        const viewScore = Math.min(100, (avgViews / 5000) * 100)
        const commentScore = Math.min(100, (avgComments / 500) * 100)
        communityHeatWeighted = Math.min(100, Math.max(0, Math.round(viewScore * 0.35 + commentScore * 0.45)))
    }

    let newsCredibilityWeighted = 0
    if (newsData.length > 0) {
        let weightedCount = 0
        const weightedSources = new Map<string, number>()
        for (const item of newsData) {
            const weight = getTimeWeight(item.created_at)
            weightedCount += weight
            const cur = weightedSources.get(item.source) || 0
            weightedSources.set(item.source, cur + weight)
        }
        const effectiveSources = Array.from(weightedSources.values()).reduce((sum, w) => sum + Math.min(1, w), 0)
        const sourceScore = (Math.min(20, effectiveSources) / 20) * 100
        const countScore = Math.min(100, weightedCount * 2)
        newsCredibilityWeighted = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const ampWeighted = communityHeatWeighted <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeatWeighted - 3) / 70))
    const heatIndex = Math.round(
        Math.min(100, Math.max(0, newsCredibilityWeighted * (0.3 + 0.7 * ampWeighted)))
    )

    // ── recentHeat 계산 (최근 7일 필터만, 시간 가중치 없음) ──────────────────
    const recentCommunity = communityData.filter(d => d.created_at >= since7d)
    const recentNews = newsData.filter(d => d.created_at >= since7d)

    let communityHeatRecent = 0
    if (recentCommunity.length > 0) {
        const totalViews = recentCommunity.reduce((sum, d) => sum + (d.view_count ?? 0), 0)
        const totalComments = recentCommunity.reduce((sum, d) => sum + (d.comment_count ?? 0), 0)
        const viewScore = Math.min(100, (totalViews / 5000) * 100)
        const commentScore = Math.min(100, (totalComments / 500) * 100)
        communityHeatRecent = Math.min(100, Math.max(0, Math.round(viewScore * 0.35 + commentScore * 0.45)))
    }

    let newsCredibilityRecent = 0
    if (recentNews.length > 0) {
        const uniqueSources = new Set(recentNews.map(d => d.source)).size
        const sourceScore = (Math.min(20, uniqueSources) / 20) * 100
        const countScore = Math.min(100, recentNews.length * 2)
        newsCredibilityRecent = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const ampRecent = communityHeatRecent <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeatRecent - 3) / 70))
    const recentHeat = Math.round(
        Math.min(100, Math.max(0, newsCredibilityRecent * (0.3 + 0.7 * ampRecent)))
    )

    // issues 테이블 업데이트 (heatIndex 기준)
    const { error } = await supabaseAdmin
        .from('issues')
        .update({
            heat_index: heatIndex,
            updated_at: new Date().toISOString(),
        })
        .eq('id', issueId)
    if (error) throw error

    return { heatIndex, recentHeat }
}

/**
 * 특정 이슈에 연결된 수집 데이터 기준으로 화력 재계산 후 반영.
 */
export async function recalculateHeatForIssue(issueId: string): Promise<number> {
    return calculateHeatIndex(issueId)
}

/**
 * calculateRecentHeat - 상태 전환 판단용 최근 화력 계산
 * 
 * 최근 N일 이내 데이터만 사용하여 화력을 계산합니다.
 * 시간 가중치를 적용하지 않고, 시간 필터만 적용합니다.
 * 상태 전환 로직에서 사용되며, 기존 임계값(30점/10점)을 유지합니다.
 * 
 * @param issueId - 이슈 ID
 * @param days - 최근 N일 (기본값: 7일)
 * @returns 최근 화력 지수 (0-100)
 */
export async function calculateRecentHeat(
    issueId: string, 
    days: number = 7
): Promise<number> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    
    const [communityResult, newsResult] = await Promise.all([
        supabaseAdmin
            .from('community_data')
            .select('view_count, comment_count')
            .eq('issue_id', issueId)
            .gte('created_at', since),
        supabaseAdmin
            .from('news_data')
            .select('source')
            .eq('issue_id', issueId)
            .gte('created_at', since),
    ])

    if (communityResult.error) throw communityResult.error
    if (newsResult.error) throw newsResult.error

    const communityData = communityResult.data ?? []
    const newsData = newsResult.data ?? []

    let communityHeat = 0
    if (communityData.length > 0) {
        const totalViews = communityData.reduce((sum, d) => sum + (d.view_count ?? 0), 0)
        const totalComments = communityData.reduce((sum, d) => sum + (d.comment_count ?? 0), 0)
        const viewScore = Math.min(100, (totalViews / 5000) * 100)
        const commentScore = Math.min(100, (totalComments / 500) * 100)
        const raw = viewScore * 0.35 + commentScore * 0.45
        communityHeat = Math.min(100, Math.max(0, Math.round(raw)))
    }

    let newsCredibility = 0
    if (newsData.length > 0) {
        const uniqueSources = new Set(newsData.map((d) => d.source)).size
        const sourceScore = (Math.min(20, uniqueSources) / 20) * 100
        const countScore = Math.min(100, newsData.length * 2)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const communityAmp = communityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))

    const recentHeat = Math.round(
        Math.min(100, Math.max(0, newsCredibility * (0.3 + 0.7 * communityAmp)))
    )

    return recentHeat
}
