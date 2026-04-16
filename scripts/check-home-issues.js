import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkIssues() {
    console.log('📊 데이터베이스 이슈 현황 확인\n')

    const { data: allIssues, count: totalCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })

    console.log(`전체 이슈 수: ${totalCount}`)

    const { data: approvedIssues, count: approvedCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')

    console.log(`승인된 이슈 수: ${approvedCount}`)

    const { data: visibleIssues, count: visibleCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')

    console.log(`승인+visible 이슈 수: ${visibleCount}`)

    const { data: notMergedIssues, count: notMergedCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)

    console.log(`승인+visible+병합안됨 이슈 수: ${notMergedCount}`)

    const MIN_HEAT = 8
    const { data: displayableIssues, count: displayableCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)

    console.log(`승인+visible+병합안됨+화력${MIN_HEAT}이상 이슈 수: ${displayableCount}\n`)

    const { data: sampleIssues } = await supabase
        .from('issues')
        .select('id, title, approval_status, visibility_status, status, heat_index, merged_into_id')
        .order('created_at', { ascending: false })
        .limit(10)

    console.log('최근 등록된 이슈 10개:')
    console.table(sampleIssues)

    const { data: statusCounts } = await supabase
        .from('issues')
        .select('approval_status')

    const statusMap = {}
    statusCounts?.forEach(issue => {
        statusMap[issue.approval_status] = (statusMap[issue.approval_status] || 0) + 1
    })

    console.log('\n승인 상태별 분포:')
    console.table(statusMap)
}

checkIssues()
