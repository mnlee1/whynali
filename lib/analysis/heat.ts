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
 */
export async function calculateHeatIndex(issueId: string): Promise<number> {
    const [communityResult, newsResult] = await Promise.all([
        supabaseAdmin
            .from('community_data')
            .select('view_count, comment_count, created_at')
            .eq('issue_id', issueId),
        supabaseAdmin
            .from('news_data')
            .select('source')
            .eq('issue_id', issueId),
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
 * 특정 이슈에 연결된 수집 데이터 기준으로 화력 재계산 후 반영.
 */
export async function recalculateHeatForIssue(issueId: string): Promise<number> {
    return calculateHeatIndex(issueId)
}
