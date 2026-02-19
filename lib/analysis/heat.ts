import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * 07_이슈등록_화력_정렬_규격.md §2.3 참조.
 * community_heat(0–100) + news_credibility(0–100) → heat_index(0–100).
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
        const raw = (totalViews / 1000) * 0.35 + (totalComments / 100) * 0.45
        communityHeat = Math.min(100, Math.max(0, Math.round(raw * 100)))
    }

    let newsCredibility = 0
    if (newsData.length > 0) {
        const uniqueSources = new Set(newsData.map((d) => d.source)).size
        const sourceScore = (Math.min(10, uniqueSources) / 10) * 100
        const countScore = Math.min(100, newsData.length * 5)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const heatIndex = Math.round(
        Math.min(100, Math.max(0, communityHeat * 0.6 + newsCredibility * 0.4))
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
