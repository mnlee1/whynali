import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkAllIssues() {
    const { data, error } = await supabase
        .from('issues')
        .select('id, title, source_track, approval_status, heat_index, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) {
        console.error('에러:', error)
        return
    }

    console.log(`\n📊 전체 이슈 ${data.length}개:\n`)
    
    const trackAIssues = data.filter(i => i.source_track === 'track_a')
    const oldIssues = data.filter(i => i.source_track !== 'track_a')
    const approvedIssues = data.filter(i => i.approval_status === '승인')
    const pendingIssues = data.filter(i => i.approval_status === '대기')
    
    console.log(`\n📈 통계:`)
    console.log(`  • Track A 이슈: ${trackAIssues.length}개`)
    console.log(`  • 기존 로직 이슈: ${oldIssues.length}개`)
    console.log(`  • 승인된 이슈: ${approvedIssues.length}개`)
    console.log(`  • 대기 중 이슈: ${pendingIssues.length}개`)
    
    console.log(`\n\n🔍 전체 이슈 목록:\n`)
    data.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.title}`)
        console.log(`   - Track: ${issue.source_track || 'NULL (기존)'}`)
        console.log(`   - 상태: ${issue.approval_status}`)
        console.log(`   - 화력: ${issue.heat_index}`)
        console.log(`   - 생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log()
    })
}

checkAllIssues()
