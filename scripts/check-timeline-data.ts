import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://mdxshmfmcdcotteevwgi.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function checkData() {
    console.log('데이터 조회 시작...\n')
    
    // timeline_summaries 확인 (stage_title과 bullets 중점 체크)
    const { data: summaries, error } = await supabase
        .from('timeline_summaries')
        .select('issue_id, stage, stage_title, bullets')
        .order('generated_at', { ascending: false })
        .limit(10)
    
    if (error) {
        console.error('timeline_summaries 조회 오류:', error)
        return
    }
    
    console.log(`=== timeline_summaries 샘플 (총 ${summaries?.length || 0}개) ===\n`)
    summaries?.forEach((s, idx) => {
        console.log(`${idx + 1}. [${s.stage}]`)
        console.log(`   stage_title: "${s.stage_title}"`)
        console.log(`   bullets 타입: ${typeof s.bullets}`)
        console.log(`   bullets 값: ${JSON.stringify(s.bullets, null, 2).substring(0, 300)}`)
        
        // bullets가 배열인지 확인
        if (Array.isArray(s.bullets)) {
            console.log(`   ✓ bullets는 배열입니다 (${s.bullets.length}개 항목)`)
            s.bullets.slice(0, 2).forEach((b, i) => {
                console.log(`     - bullets[${i}]: "${b}"`)
            })
        } else {
            console.log(`   ✗ bullets가 배열이 아닙니다!`)
        }
        console.log('')
    })

    // 특정 이슈 (국힘 지지율 18% 최저치) 데이터 확인
    const { data: issue } = await supabase
        .from('issues')
        .select('id, title')
        .ilike('title', '%지지율%18%')
        .single()
    
    if (issue) {
        console.log(`\n=== "${issue.title}" 이슈의 timeline_summaries ===\n`)
        const { data: issueSummaries } = await supabase
            .from('timeline_summaries')
            .select('*')
            .eq('issue_id', issue.id)
            .order('stage')
        
        issueSummaries?.forEach(s => {
            console.log(`\n[${s.stage}] "${s.stage_title}"`)
            console.log(`bullets: ${JSON.stringify(s.bullets, null, 2)}`)
        })
    }
}

checkData()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('오류:', err)
        process.exit(1)
    })
