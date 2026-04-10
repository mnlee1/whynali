/**
 * scripts/check-category-issues-detail.ts
 * 
 * 카테고리별 승인 이슈 현황 상세 조회
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

const CATEGORIES = ['정치', '사회', '경제', '세계', '연예', '스포츠', '기술']

async function main() {
    console.log('=== 카테고리별 승인 이슈 상세 현황 ===\n')

    const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')

    for (const category of CATEGORIES) {
        console.log(`\n[ ${category} ]`)

        // 승인 + visibility_status='visible' + merged_into_id IS NULL 조건
        const { data, error, count } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, visibility_status, heat_index, created_at', { count: 'exact' })
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .eq('category', category)
            .order('created_at', { ascending: false })

        if (error) {
            console.error(`  ❌ 조회 실패:`, error)
            continue
        }

        console.log(`  총 ${count}개 (heat >= ${MIN_HEAT}: ${data?.filter(i => (i.heat_index ?? 0) >= MIN_HEAT).length}개)`)

        if (data && data.length > 0) {
            console.log(`\n  최근 이슈:`)
            data.slice(0, 5).forEach((issue, idx) => {
                console.log(`    ${idx + 1}. ${issue.title}`)
                console.log(`       heat: ${issue.heat_index ?? 0}, created: ${issue.created_at}`)
            })
        } else {
            console.log(`  ⚠️ 이슈 없음`)
        }
    }

    // 전체 승인 이슈 현황
    console.log(`\n\n[ 전체 승인 이슈 통계 ]`)

    const { count: totalApproved } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')

    const { count: totalVisible } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')

    const { count: totalVisibleNotMerged } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)

    console.log(`  승인된 전체 이슈: ${totalApproved}개`)
    console.log(`  visibility_status='visible': ${totalVisible}개`)
    console.log(`  visible + 병합되지 않음: ${totalVisibleNotMerged}개`)

    // 카테고리 없는 승인 이슈 확인
    const { data: noCategory } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status')
        .eq('approval_status', '승인')
        .is('category', null)

    if (noCategory && noCategory.length > 0) {
        console.log(`\n  ⚠️ 카테고리 없는 승인 이슈: ${noCategory.length}개`)
        noCategory.forEach(issue => {
            console.log(`    - ${issue.title}`)
        })
    }
}

main().catch(console.error)
