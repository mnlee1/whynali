/**
 * scripts/check_feb26_status.ts
 * 
 * 2월 26일 이슈 상태 재확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    const feb26Start = new Date('2026-02-26T00:00:00Z').toISOString()
    const feb27Start = new Date('2026-02-27T00:00:00Z').toISOString()

    const { count: igniteCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('status', '점화')
        .gte('created_at', feb26Start)
        .lt('created_at', feb27Start)

    const { count: debatedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('status', '논란중')
        .gte('created_at', feb26Start)
        .lt('created_at', feb27Start)

    const { count: closedCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('status', '종결')
        .gte('created_at', feb26Start)
        .lt('created_at', feb27Start)

    console.log('=== 2월 26일 등록 이슈 상태 ===\n')
    console.log(`점화: ${igniteCount}개`)
    console.log(`논란중: ${debatedCount}개`)
    console.log(`종결: ${closedCount}개`)
    console.log(`총: ${(igniteCount ?? 0) + (debatedCount ?? 0) + (closedCount ?? 0)}개`)
}

main().catch(console.error)
