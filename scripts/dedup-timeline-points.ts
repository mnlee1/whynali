/**
 * scripts/dedup-timeline-points.ts
 *
 * 타임라인 포인트 중복 제거
 * - 같은 이슈 내에서 1시간 이내 제목이 80% 이상 겹치는 포인트 중 하나만 남김
 * - 남기는 기준: 더 이른 occurred_at
 *
 * 실행: npx tsx scripts/dedup-timeline-points.ts --dry-run
 *       npx tsx scripts/dedup-timeline-points.ts
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
const TIME_WINDOW_MS = 60 * 60 * 1000  // 1시간
const SIMILARITY_THRESHOLD = 0.8        // 80% 이상 겹치면 중복

interface TimelinePoint {
    id: string
    title: string
    occurred_at: string
    stage: string
    source_url: string | null
}

// 두 제목의 단어 겹침 비율 (Jaccard 유사도)
function titleSimilarity(a: string, b: string): number {
    const normalize = (s: string) => s
        .replace(/[""''「」『』\[\]()（）]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    const wordsA = new Set(normalize(a).split(/\s+/).filter(w => w.length > 1))
    const wordsB = new Set(normalize(b).split(/\s+/).filter(w => w.length > 1))

    if (wordsA.size === 0 && wordsB.size === 0) return 1
    if (wordsA.size === 0 || wordsB.size === 0) return 0

    const intersection = [...wordsA].filter(w => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return intersection / union
}

async function main() {
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}타임라인 중복 제거 시작\n`)

    // 병합된 이슈가 있는 주 이슈 목록
    const { data: mergedRows } = await supabase
        .from('issues')
        .select('merged_into_id')
        .not('merged_into_id', 'is', null)

    const primaryIds = [...new Set((mergedRows ?? []).map((i: any) => i.merged_into_id))]

    // 전체 이슈로 확장하려면 아래 주석 해제
    // const { data: allIssues } = await supabase.from('issues').select('id').eq('approval_status', '승인')
    // const primaryIds = allIssues?.map(i => i.id) ?? []

    console.log(`대상 이슈: ${primaryIds.length}개\n`)

    let totalDeleted = 0

    for (const issueId of primaryIds) {
        const { data: issue } = await supabase.from('issues').select('title').eq('id', issueId).single()
        const { data: points } = await supabase
            .from('timeline_points')
            .select('id, title, occurred_at, stage, source_url')
            .eq('issue_id', issueId)
            .order('occurred_at', { ascending: true })

        if (!points || points.length < 2) continue

        const toDelete = new Set<string>()

        for (let i = 0; i < points.length; i++) {
            if (toDelete.has(points[i].id)) continue

            for (let j = i + 1; j < points.length; j++) {
                if (toDelete.has(points[j].id)) continue

                const timeDiff = Math.abs(
                    new Date(points[i].occurred_at).getTime() -
                    new Date(points[j].occurred_at).getTime()
                )
                if (timeDiff > TIME_WINDOW_MS) break  // 시간순 정렬이므로 이후는 더 멀어짐

                const sim = titleSimilarity(points[i].title ?? '', points[j].title ?? '')
                if (sim >= SIMILARITY_THRESHOLD) {
                    // 나중 포인트(j) 삭제 (이른 것 유지)
                    toDelete.add(points[j].id)
                }
            }
        }

        if (toDelete.size === 0) continue

        console.log(`▶ "${issue?.title}" — ${toDelete.size}건 중복 삭제`)
        if (!DRY_RUN) {
            await supabase.from('timeline_points').delete().in('id', [...toDelete])
        }
        totalDeleted += toDelete.size
    }

    console.log(`\n완료: 총 ${totalDeleted}건 ${DRY_RUN ? '(dry-run)' : '삭제'}`)
    if (DRY_RUN) console.log('(--dry-run: 실제 DB 변경 없음)')
}

main().catch(console.error)
