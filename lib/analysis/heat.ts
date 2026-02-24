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
        // 만점 기준: 조회수 합산 14,285건 / 댓글 합산 1,111건 (핫게 중간 이상)
        const raw = (totalViews / 5000) * 0.35 + (totalComments / 500) * 0.45
        communityHeat = Math.min(100, Math.max(0, Math.round(raw * 100)))
    }

    let newsCredibility = 0
    if (newsData.length > 0) {
        const uniqueSources = new Set(newsData.map((d) => d.source)).size
        // 만점 기준: 출처 20곳 이상 / 뉴스 50건 이상 (대형 이슈 기준)
        const sourceScore = (Math.min(20, uniqueSources) / 20) * 100
        const countScore = Math.min(100, newsData.length * 2)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    /*
     * 화력 = newsCredibility × (0.3 + 0.7 × community_amp)
     *
     * community_amp: 커뮤니티 반응 강도 증폭 계수 (0~1)
     *   - communityHeat ≤ 10: amp=0 (조회수·댓글이 거의 없는 노이즈 수준, 무시)
     *   - communityHeat > 10: sqrt((communityHeat - 10) / 90) 로 완만하게 증폭
     *
     * 설계 의도:
     *   커뮤니티 반응이 없으면 최대 30점 → 관리자 반려 권장 구간(30 미만)에 걸림.
     *   커뮤니티가 점차 달아오를수록 화력이 곡선형으로 상승 ("점화" 비유).
     *   초기 미약한 반응(키워드 우연 매칭 1~2건)은 임계값으로 제거.
     *   근거: 07_이슈등록_화력_정렬_규격.md §2.3, §6.4
     */
    const communityAmp = communityHeat <= 10
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 10) / 90))

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
