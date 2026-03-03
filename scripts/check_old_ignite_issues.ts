/**
 * scripts/check_old_ignite_issues.ts
 * 
 * 오래된 점화 상태 이슈 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 2월 26일 등록된 점화 상태 이슈 확인 ===\n')

    const feb26Start = new Date('2026-02-26T00:00:00Z').toISOString()
    const feb27Start = new Date('2026-02-27T00:00:00Z').toISOString()

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, status, approval_status, approval_type, heat_index, created_at, approved_at')
        .eq('status', '점화')
        .gte('created_at', feb26Start)
        .lt('created_at', feb27Start)
        .order('heat_index', { ascending: false })

    if (!issues || issues.length === 0) {
        console.log('해당 이슈 없음')
        return
    }

    console.log(`총 ${issues.length}개 이슈:\n`)

    const now = Date.now()

    for (const issue of issues) {
        const createdAt = new Date(issue.created_at)
        const approvedAt = issue.approved_at ? new Date(issue.approved_at) : null
        const baseTime = approvedAt || createdAt
        const elapsedHours = (now - baseTime.getTime()) / (1000 * 60 * 60)

        console.log(`[${issue.approval_status}] ${issue.title.substring(0, 60)}`)
        console.log(`  - 화력: ${issue.heat_index ?? 0}점`)
        console.log(`  - 생성: ${createdAt.toLocaleString('ko-KR')}`)
        console.log(`  - 승인: ${approvedAt ? approvedAt.toLocaleString('ko-KR') : 'null'}`)
        console.log(`  - 경과: ${elapsedHours.toFixed(1)}시간`)
        console.log(`  - approval_type: ${issue.approval_type ?? 'null'}`)

        // 상태 전환 조건 체크
        const heat = issue.heat_index ?? 0

        if (!approvedAt) {
            console.log(`  ⚠️  승인되지 않음 (approval_status: ${issue.approval_status})`)
        } else if (elapsedHours < 6) {
            console.log(`  ⏳ 아직 6시간 미경과`)
        } else if (heat < 10) {
            console.log(`  ❌ 6시간 경과 + 화력 ${heat}점 → 바이패스로 종결되어야 함`)
        } else if (heat >= 30) {
            // 커뮤니티 수 확인
            const { count: communityCount } = await supabaseAdmin
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issue.id)

            console.log(`  커뮤니티: ${communityCount}건`)

            if (communityCount >= 1) {
                console.log(`  ❌ 6시간 경과 + 화력 ${heat}점 + 커뮤니티 ${communityCount}건 → 논란중 전환되어야 함`)
            } else {
                console.log(`  ⚠️  커뮤니티 반응 부족 (논란중 전환 불가)`)
            }
        } else if (elapsedHours >= 24) {
            console.log(`  ❌ 24시간 경과 + 화력 ${heat}점 (30점 미만) → 타임아웃으로 종결되어야 함`)
        } else {
            console.log(`  ⏳ 10~29점 구간, 24시간 미만 (${elapsedHours.toFixed(1)}h)`)
        }

        console.log()
    }

    console.log('\n=== 분석 ===')
    console.log('- "승인되지 않음"인 경우: recalculate-heat Cron에서 상태 전환 로직이 승인된 이슈만 처리할 가능성')
    console.log('- "전환되어야 함"인 경우: Cron이 제대로 실행 안되거나 로직 오류')
}

main().catch(console.error)
