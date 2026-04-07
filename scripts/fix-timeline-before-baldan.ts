/**
 * scripts/fix-timeline-before-baldan.ts
 *
 * [기존 데이터 정리] 발단 이전 타임라인 포인트 삭제
 *
 * 이슈 병합 시 부 이슈의 타임라인 포인트가 무조건 '파생'으로 변경되면서
 * 발단보다 이른 occurred_at을 가진 포인트가 남아있는 문제를 정리합니다.
 *
 * 실행:
 *   npx tsx scripts/fix-timeline-before-baldan.ts --dry-run   # 결과 확인만
 *   npx tsx scripts/fix-timeline-before-baldan.ts             # 실제 삭제
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
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}발단 이전 타임라인 포인트 정리 시작\n`)

    // 1. 발단 포인트가 있는 이슈 + 그 이슈의 최초 발단 시각 조회
    const { data: baldanPoints, error } = await supabase
        .from('timeline_points')
        .select('issue_id, occurred_at')
        .eq('stage', '발단')
        .order('occurred_at', { ascending: true })

    if (error) {
        console.error('발단 포인트 조회 실패:', error)
        process.exit(1)
    }

    // 이슈별 최초 발단 시각 집계
    const earliestBaldan = new Map<string, string>()
    for (const p of baldanPoints) {
        if (!earliestBaldan.has(p.issue_id)) {
            earliestBaldan.set(p.issue_id, p.occurred_at)
        }
    }

    console.log(`발단 포인트가 있는 이슈: ${earliestBaldan.size}건\n`)

    let totalDeleted = 0

    for (const [issueId, baldanAt] of earliestBaldan) {
        // 해당 이슈에서 발단 시각보다 이른 포인트 조회 (발단 자체는 제외)
        const { data: stalePoints, error: fetchError } = await supabase
            .from('timeline_points')
            .select('id, stage, occurred_at, title')
            .eq('issue_id', issueId)
            .neq('stage', '발단')
            .lt('occurred_at', baldanAt)

        if (fetchError) {
            console.error(`  ❌ [${issueId}] 조회 실패:`, fetchError)
            continue
        }

        if (!stalePoints || stalePoints.length === 0) continue

        console.log(`  이슈 ${issueId} — 발단: ${baldanAt}`)
        for (const p of stalePoints) {
            console.log(`    삭제 대상: [${p.stage}] ${p.occurred_at} — ${p.title ?? '(제목 없음)'}`)
        }

        if (!DRY_RUN) {
            const ids = stalePoints.map(p => p.id)
            const { error: deleteError } = await supabase
                .from('timeline_points')
                .delete()
                .in('id', ids)

            if (deleteError) {
                console.error(`  ❌ [${issueId}] 삭제 실패:`, deleteError)
                continue
            }
        }

        totalDeleted += stalePoints.length
    }

    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}완료: ${totalDeleted}건 ${DRY_RUN ? '삭제 예정' : '삭제됨'}`)
}

main().catch(console.error)
