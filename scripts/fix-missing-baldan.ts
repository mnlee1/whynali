/**
 * scripts/fix-missing-baldan.ts
 *
 * [기존 데이터 정리] 발단 없는 이슈에 발단 포인트 추가
 *
 * 트랙A를 거치지 않아 발단이 없는 이슈를 두 가지 케이스로 처리합니다.
 *
 * 케이스 A: 타임라인 포인트는 있지만 발단이 없는 이슈
 *   → 기존 포인트 중 가장 오래된 것의 stage를 '발단'으로 변경
 *
 * 케이스 B: 타임라인 포인트 자체가 없는 이슈
 *   → 연결된 news_data 중 가장 오래된 기사로 발단 포인트 신규 생성
 *
 * 실행:
 *   npx tsx scripts/fix-missing-baldan.ts --dry-run   # 결과 확인만
 *   npx tsx scripts/fix-missing-baldan.ts             # 실제 변경
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
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}발단 없는 이슈 보정 시작\n`)

    // 1. 승인된 이슈 전체 조회 (병합됨 제외)
    const { data: issues, error: issueError } = await supabase
        .from('issues')
        .select('id, title')
        .in('approval_status', ['승인', '대기'])
        .order('created_at', { ascending: true })

    if (issueError || !issues) {
        console.error('이슈 조회 실패:', issueError)
        process.exit(1)
    }

    console.log(`대상 이슈: ${issues.length}건\n`)

    // 2. 발단이 있는 이슈 ID 목록
    const { data: baldanPoints, error: baldanError } = await supabase
        .from('timeline_points')
        .select('issue_id')
        .eq('stage', '발단')

    if (baldanError) {
        console.error('발단 포인트 조회 실패:', baldanError)
        process.exit(1)
    }

    const issuesWithBaldan = new Set((baldanPoints ?? []).map(p => p.issue_id))

    // 3. 발단 없는 이슈만 필터
    const issuesWithoutBaldan = issues.filter(i => !issuesWithBaldan.has(i.id))

    if (issuesWithoutBaldan.length === 0) {
        console.log('발단 없는 이슈가 없습니다. 모두 정상입니다.')
        return
    }

    console.log(`발단 없는 이슈: ${issuesWithoutBaldan.length}건\n`)

    let caseACount = 0
    let caseBCount = 0
    let skippedCount = 0

    for (const issue of issuesWithoutBaldan) {
        console.log(`▶ "${issue.title}" (${issue.id})`)

        // 4. 기존 타임라인 포인트 조회 (시간순)
        const { data: existingPoints } = await supabase
            .from('timeline_points')
            .select('id, stage, occurred_at, title, source_url')
            .eq('issue_id', issue.id)
            .order('occurred_at', { ascending: true })

        // ── 케이스 A: 포인트 있지만 발단 없음 ──
        if (existingPoints && existingPoints.length > 0) {
            const oldest = existingPoints[0]
            console.log(`  케이스 A: 가장 오래된 포인트를 발단으로 변경`)
            console.log(`    [${oldest.stage}] ${oldest.occurred_at} — ${oldest.title ?? '(제목 없음)'}`)

            if (!DRY_RUN) {
                const { error: updateError } = await supabase
                    .from('timeline_points')
                    .update({ stage: '발단' })
                    .eq('id', oldest.id)

                if (updateError) {
                    console.error(`  ❌ 업데이트 실패:`, updateError)
                    skippedCount++
                    continue
                }
            }

            console.log(`  ✓ 발단 지정 완료`)
            caseACount++
            continue
        }

        // ── 케이스 B: 타임라인 포인트 자체가 없음 ──
        const { data: linkedNews } = await supabase
            .from('news_data')
            .select('id, title, link, published_at')
            .eq('issue_id', issue.id)
            .not('link', 'is', null)
            .order('published_at', { ascending: true })
            .limit(1)

        if (!linkedNews || linkedNews.length === 0) {
            console.log(`  ⚠️  연결된 뉴스 없음 — 건너뜀`)
            skippedCount++
            continue
        }

        const firstNews = linkedNews[0]
        console.log(`  케이스 B: news_data 최초 기사로 발단 신규 생성`)
        console.log(`    "${firstNews.title}" (${firstNews.published_at})`)

        if (!DRY_RUN) {
            const { error: insertError } = await supabase
                .from('timeline_points')
                .insert({
                    issue_id: issue.id,
                    title: firstNews.title ?? '',
                    occurred_at: firstNews.published_at ?? new Date().toISOString(),
                    source_url: firstNews.link ?? '',
                    stage: '발단',
                })

            if (insertError) {
                console.error(`  ❌ 생성 실패:`, insertError)
                skippedCount++
                continue
            }
        }

        console.log(`  ✓ 발단 생성 완료`)
        caseBCount++
    }

    console.log(`
${DRY_RUN ? '[DRY RUN] ' : ''}완료
  케이스 A (포인트 변경): ${caseACount}건
  케이스 B (포인트 신규): ${caseBCount}건
  건너뜀:                ${skippedCount}건`)
}

main().catch(console.error)
