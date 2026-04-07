/**
 * scripts/deduplicate-timeline.ts
 *
 * 기존 timeline_points 중 제목 유사도 기반 중복 포인트 정리
 * 사용: npx tsx scripts/deduplicate-timeline.ts [--execute] [--check-risky]
 *   기본값: dryRun (삭제 없이 결과만 출력)
 *   --execute: 실제 삭제 실행
 *   --check-risky: 유지 1건짜리 이슈 상세 출력
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const dryRun = !process.argv.includes('--execute')
const checkRisky = process.argv.includes('--check-risky')

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '까지', '부터', '에서', '에게', '한테', '한', '하는', '하고', '하여', '해서',
    '이다', '있다', '없다', '하다', '되다', '이고', '하며', '에도', '으로도', '이라', '라',
    '것', '수', '등', '및', '또', '그', '더', '이후', '앞서', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '내일', '어제', '해당', '기자',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

function isSimilarTitle(newTitle: string, existingTitles: string[]): boolean {
    const newKeywords = extractKeywords(newTitle)
    if (newKeywords.size === 0) return false
    for (const existing of existingTitles) {
        const existingKeywords = extractKeywords(existing)
        let overlap = 0
        for (const kw of newKeywords) {
            if (existingKeywords.has(kw)) overlap++
        }
        if (overlap >= 3) return true
    }
    return false
}

async function run() {
    const mode = checkRisky ? 'RISKY 확인' : dryRun ? 'DRY RUN' : '실제 삭제'
    console.log(`=== 타임라인 중복 정리 (${mode}) ===\n`)

    const { data: issues } = await supabase
        .from('issues')
        .select('id, title')
        .order('created_at', { ascending: false })
        .limit(500)

    if (!issues || issues.length === 0) {
        console.log('처리할 이슈 없음')
        return
    }

    let totalDeleted = 0
    let processedIssues = 0
    let riskyCount = 0

    for (const issue of issues) {
        const { data: points } = await supabase
            .from('timeline_points')
            .select('id, title, occurred_at')
            .eq('issue_id', issue.id)
            .order('occurred_at', { ascending: true })

        if (!points || points.length <= 1) continue

        const keepIds: string[] = []
        const deleteIds: string[] = []
        const deleteTitles: string[] = []
        const seenTitles: string[] = []

        for (const point of points) {
            if (!point.title || !isSimilarTitle(point.title, seenTitles)) {
                keepIds.push(point.id)
                if (point.title) seenTitles.push(point.title)
            } else {
                deleteIds.push(point.id)
                deleteTitles.push(point.title ?? '')
            }
        }

        if (deleteIds.length === 0) continue

        const isRisky = keepIds.length === 1

        if (checkRisky) {
            if (!isRisky) continue
            riskyCount++
            console.log(`\n[${issue.title}]`)
            console.log(`  유지: "${seenTitles[0]}"`)
            console.log(`  삭제 예정:`)
            deleteTitles.forEach(t => console.log(`    - ${t}`))
            continue
        }

        if (!checkRisky) {
            console.log(`[${issue.title}]  유지: ${keepIds.length}건 / 삭제: ${deleteIds.length}건${isRisky ? ' ⚠️' : ''}`)
        }

        if (!dryRun) {
            const { error } = await supabase
                .from('timeline_points')
                .delete()
                .in('id', deleteIds)

            if (error) {
                console.error(`  ❌ 삭제 실패: ${error.message}`)
                continue
            }
        }

        totalDeleted += deleteIds.length
        processedIssues++
    }

    if (checkRisky) {
        console.log(`\n⚠️  유지 1건짜리 이슈: ${riskyCount}건`)
        return
    }

    console.log(`\n=== 완료 ===`)
    console.log(`처리 이슈: ${processedIssues}건`)
    console.log(`${dryRun ? '삭제 예정' : '삭제 완료'}: ${totalDeleted}건`)
    if (dryRun) console.log('\n실제 삭제하려면: npx tsx scripts/deduplicate-timeline.ts --execute')
}

run().catch(console.error)
