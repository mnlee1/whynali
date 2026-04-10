/**
 * scripts/check-production-data.ts
 * 
 * 실서버(프로덕션) 데이터베이스 이슈 현황 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.production.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ .env.production.local 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

const CATEGORIES = ['정치', '사회', '경제', '세계', '연예', '스포츠', '기술']

async function main() {
    console.log('=== 실서버 데이터베이스 이슈 현황 ===\n')
    console.log(`Supabase URL: ${supabaseUrl}\n`)

    // 전체 승인 이슈 현황
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

    console.log('[ 전체 승인 이슈 통계 ]')
    console.log(`  승인된 전체 이슈: ${totalApproved}개`)
    console.log(`  visibility_status='visible': ${totalVisible}개`)
    console.log(`  visible + 병합되지 않음: ${totalVisibleNotMerged}개\n`)

    // 카테고리별 승인 이슈 현황
    console.log('[ 카테고리별 승인 이슈 현황 ]\n')

    for (const category of CATEGORIES) {
        const { data, count, error } = await supabaseAdmin
            .from('issues')
            .select('id, title, heat_index, created_at', { count: 'exact' })
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .eq('category', category)
            .order('created_at', { ascending: false })
            .limit(5)

        if (error) {
            console.log(`${category}: ❌ 조회 실패`)
            console.error(error)
            continue
        }

        console.log(`${category}: ${count}개`)
        if (data && data.length > 0) {
            data.forEach((issue, idx) => {
                const createdAt = new Date(issue.created_at).toLocaleString('ko-KR')
                console.log(`  ${idx + 1}. ${issue.title}`)
                console.log(`     heat: ${issue.heat_index ?? 0}, 등록: ${createdAt}`)
            })
        }
        console.log()
    }

    // 최근 등록된 이슈 (모든 상태)
    console.log('[ 최근 등록된 이슈 (모든 승인 상태) ]\n')
    
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('title, approval_status, visibility_status, category, heat_index, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    if (recentIssues) {
        recentIssues.forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   상태: ${issue.approval_status}, 노출: ${issue.visibility_status}`)
            console.log(`   카테고리: ${issue.category}, heat: ${issue.heat_index ?? 0}`)
            console.log()
        })
    }

    // 대기중인 이슈
    const { count: pendingCount } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '대기')

    console.log(`\n[ 대기중인 이슈: ${pendingCount}개 ]`)
}

main().catch(console.error)
