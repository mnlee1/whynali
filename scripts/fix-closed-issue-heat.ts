/**
 * scripts/fix-closed-issue-heat.ts
 *
 * 종결 이슈의 화력 지수 일괄 재계산
 *
 * 종결 이슈는 recalculate-heat 크론 대상에서 제외되어 있었기 때문에
 * 종결 시점의 화력 값이 그대로 고정되어 있습니다.
 * 이 스크립트는 모든 종결 이슈의 화력을 시간 가중치를 적용해 재계산합니다.
 *
 * 실행:
 *   npx tsx scripts/fix-closed-issue-heat.ts
 *   npx tsx scripts/fix-closed-issue-heat.ts --dry-run   # 실제 변경 없이 결과만 확인
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
)

const DRY_RUN = process.argv.includes('--dry-run')

// heat.ts와 동일한 시간 가중치 함수
function getTimeWeight(createdAt: string): number {
    const age = Date.now() - new Date(createdAt).getTime()
    const daysSinceCreated = age / (1000 * 60 * 60 * 24)
    if (daysSinceCreated <= 3) return 1.0
    if (daysSinceCreated >= 30) return 0
    return 1.0 - (daysSinceCreated - 3) / 27
}

async function calcHeat(issueId: string): Promise<number> {
    const [communityResult, newsResult] = await Promise.all([
        supabase
            .from('community_data')
            .select('view_count, comment_count, created_at')
            .eq('issue_id', issueId),
        supabase
            .from('news_data')
            .select('source, created_at')
            .eq('issue_id', issueId),
    ])

    const communityData = communityResult.data ?? []
    const newsData = newsResult.data ?? []

    let communityHeat = 0
    if (communityData.length > 0) {
        let weightedViews = 0
        let weightedComments = 0
        for (const item of communityData) {
            const w = getTimeWeight(item.created_at)
            weightedViews += (item.view_count ?? 0) * w
            weightedComments += (item.comment_count ?? 0) * w
        }
        const avgViews = weightedViews / communityData.length
        const avgComments = weightedComments / communityData.length
        const viewScore = Math.min(100, (avgViews / 5000) * 100)
        const commentScore = Math.min(100, (avgComments / 500) * 100)
        communityHeat = Math.min(100, Math.max(0, Math.round(viewScore * 0.35 + commentScore * 0.45)))
    }

    let newsCredibility = 0
    if (newsData.length > 0) {
        let weightedCount = 0
        const weightedSources = new Map<string, number>()
        for (const item of newsData) {
            const w = getTimeWeight(item.created_at)
            weightedCount += w
            weightedSources.set(item.source, (weightedSources.get(item.source) ?? 0) + w)
        }
        const effectiveSources = Array.from(weightedSources.values())
            .reduce((sum, w) => sum + Math.min(1, w), 0)
        const sourceScore = (Math.min(20, effectiveSources) / 20) * 100
        const countScore = Math.min(100, weightedCount * 2)
        newsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const communityAmp = communityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))

    return Math.round(Math.min(100, Math.max(0, newsCredibility * (0.3 + 0.7 * communityAmp))))
}

async function main() {
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}종결 이슈 화력 일괄 재계산 시작\n`)

    // 종결 이슈 전체 조회 (heat_index > 0인 것만 — 이미 0이면 처리 불필요)
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, heat_index, updated_at')
        .eq('status', '종결')
        .gt('heat_index', 0)
        .order('heat_index', { ascending: false })

    if (error) {
        console.error('이슈 조회 실패:', error)
        process.exit(1)
    }

    console.log(`대상 이슈: ${issues.length}건\n`)

    let changed = 0
    let unchanged = 0
    const BATCH = 5

    for (let i = 0; i < issues.length; i += BATCH) {
        const batch = issues.slice(i, i + BATCH)

        await Promise.all(batch.map(async (issue) => {
            const newHeat = await calcHeat(issue.id)
            const diff = issue.heat_index - newHeat

            if (diff === 0) {
                unchanged++
                return
            }

            console.log(
                `${issue.title.slice(0, 35).padEnd(35)} | ` +
                `${String(issue.heat_index).padStart(3)} → ${String(newHeat).padStart(3)} ` +
                `(${diff > 0 ? '-' : '+'}${Math.abs(diff)})`
            )

            if (!DRY_RUN) {
                await supabase
                    .from('issues')
                    .update({ heat_index: newHeat, heat_updated_at: new Date().toISOString() })
                    .eq('id', issue.id)
            }

            changed++
        }))
    }

    console.log(`\n완료: 변경 ${changed}건 / 변경 없음 ${unchanged}건`)
    if (DRY_RUN) console.log('(--dry-run: 실제 DB 변경 없음)')
}

main()
