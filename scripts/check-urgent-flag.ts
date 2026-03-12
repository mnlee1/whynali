/**
 * scripts/check-urgent-flag.ts
 * 
 * 특정 이슈의 is_urgent 플래그 확인
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkUrgentFlag() {
    const { data: issues } = await supabase
        .from('issues')
        .select('id, title, category, heat_index, is_urgent, source_track, created_at')
        .gte('heat_index', 30)
        .eq('category', '정치')
        .order('heat_index', { ascending: false })
        .limit(5)

    console.log('화력 30점 이상 정치 이슈의 is_urgent 플래그 확인\n')
    
    issues?.forEach(issue => {
        console.log(`제목: ${issue.title}`)
        console.log(`화력: ${issue.heat_index}점`)
        console.log(`is_urgent: ${issue.is_urgent ?? 'null'}`)
        console.log(`source_track: ${issue.source_track ?? 'null'}`)
        console.log(`생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`🔥 아이콘 표시: ${issue.is_urgent ? 'YES' : 'NO'}`)
        console.log()
    })
}

checkUrgentFlag()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('에러:', err)
        process.exit(1)
    })
