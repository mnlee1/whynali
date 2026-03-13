import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkLatestIssues() {
    const { data, error } = await supabase
        .from('issues')
        .select('id, title, source_track, approval_status, heat_index, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('에러:', error)
        return
    }

    console.log(`\n📊 최근 이슈 ${data.length}개:\n`)
    data.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.title}`)
        console.log(`   - Track: ${issue.source_track || 'N/A'}`)
        console.log(`   - 상태: ${issue.approval_status}`)
        console.log(`   - 화력: ${issue.heat_index}`)
        console.log(`   - 생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log()
    })
}

checkLatestIssues()
