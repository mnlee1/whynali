/**
 * scripts/fix-merged-news-links.ts
 *
 * 병합 시 잘못 연결된 뉴스/커뮤니티 데이터 정정
 * 주 이슈의 발단 포인트 시각 이전에 연결된 데이터를 연결 해제(null)
 *
 * 실행: npx tsx scripts/fix-merged-news-links.ts --dry-run
 *       npx tsx scripts/fix-merged-news-links.ts
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

async function main() {
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}병합 이슈 뉴스 연결 정정 시작\n`)

    // 병합된 이슈(merged_into_id가 있는)의 주 이슈 ID 목록 조회
    const { data: mergedIssues, error } = await supabase
        .from('issues')
        .select('merged_into_id')
        .not('merged_into_id', 'is', null)

    if (error) { console.error('조회 실패:', error); process.exit(1) }

    const primaryIds = [...new Set((mergedIssues ?? []).map((i: any) => i.merged_into_id))]

    if (primaryIds.length === 0) {
        console.log('병합된 이슈가 없습니다.')
        return
    }

    const { data: primaryIssues } = await supabase
        .from('issues')
        .select('id, title, created_at')
        .in('id', primaryIds)

    const uniquePrimaries = primaryIssues ?? []

    console.log(`주 이슈 ${uniquePrimaries.length}개 처리\n`)

    for (const primary of uniquePrimaries) {
        // 발단 포인트 시각 조회
        const { data: baldan } = await supabase
            .from('timeline_points')
            .select('occurred_at')
            .eq('issue_id', primary.id)
            .eq('stage', '발단')
            .order('occurred_at', { ascending: true })
            .limit(1)

        const baldanAt = baldan?.[0]?.occurred_at
        if (!baldanAt) {
            console.log(`  ⚠️  "${primary.title}" — 발단 포인트 없음, 건너뜀`)
            continue
        }

        console.log(`▶ "${primary.title}"`)
        console.log(`  발단 시각: ${baldanAt}`)

        // 발단 이전 news_data 카운트
        const { count: newsCount } = await supabase
            .from('news_data')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', primary.id)
            .lt('published_at', baldanAt)

        // 발단 이전 community_data 카운트
        const { count: communityCount } = await supabase
            .from('community_data')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', primary.id)
            .lt('created_at', baldanAt)

        console.log(`  발단 이전 뉴스: ${newsCount ?? 0}건, 커뮤니티: ${communityCount ?? 0}건`)

        // 발단 이전 timeline_points 카운트
        const { count: timelineCount } = await supabase
            .from('timeline_points')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', primary.id)
            .lt('occurred_at', baldanAt)
            .neq('stage', '발단')

        console.log(`  발단 이전 타임라인 포인트: ${timelineCount ?? 0}건`)

        if (!DRY_RUN) {
            if ((newsCount ?? 0) > 0) {
                await supabase
                    .from('news_data')
                    .update({ issue_id: null })
                    .eq('issue_id', primary.id)
                    .lt('published_at', baldanAt)
            }

            if ((communityCount ?? 0) > 0) {
                await supabase
                    .from('community_data')
                    .update({ issue_id: null })
                    .eq('issue_id', primary.id)
                    .lt('created_at', baldanAt)
            }

            if ((timelineCount ?? 0) > 0) {
                await supabase
                    .from('timeline_points')
                    .delete()
                    .eq('issue_id', primary.id)
                    .lt('occurred_at', baldanAt)
                    .neq('stage', '발단')
            }

            console.log(`  ✅ 연결 해제 완료`)
        }
        console.log()
    }

    if (DRY_RUN) console.log('(--dry-run: 실제 DB 변경 없음)')
    else console.log('완료')
}

main().catch(console.error)
