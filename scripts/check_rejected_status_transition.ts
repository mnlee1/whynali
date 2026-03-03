/**
 * scripts/check_rejected_status_transition.ts
 * 
 * 반려 이슈의 status 전환 현황 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 반려 이슈 status 전환 현황 ===\n')

    const { count: igniteCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .eq('status', '점화')

    const { count: debatedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .eq('status', '논란중')

    const { count: closedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '반려')
        .eq('status', '종결')

    console.log('[ 반려 이슈 상태 분포 ]')
    console.log(`점화: ${igniteCount}개`)
    console.log(`논란중: ${debatedCount}개`)
    console.log(`종결: ${closedCount}개`)
    console.log(`총: ${(igniteCount ?? 0) + (debatedCount ?? 0) + (closedCount ?? 0)}개\n`)

    // 반려 + 점화 샘플 (전환 대기 중)
    const { data: igniteSamples } = await supabaseAdmin
        .from('issues')
        .select('title, heat_index, created_at')
        .eq('approval_status', '반려')
        .eq('status', '점화')
        .order('heat_index', { ascending: false })
        .limit(5)

    if (igniteSamples && igniteSamples.length > 0) {
        console.log('[ 반려 + 점화 샘플 (화력 높은 순) ]')
        igniteSamples.forEach((issue, idx) => {
            const elapsedHours = (Date.now() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60)
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점 | 경과: ${elapsedHours.toFixed(1)}시간`)
        })
    }
}

main().catch(console.error)
