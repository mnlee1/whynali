import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://banhuygrqgezhlpyytyc.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmh1eWdycWdlemhscHl5dHljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMzQ0MSwiZXhwIjoyMDg2MTc5NDQxfQ.dMrfD0-TAl7fTfdBVQHNMQ0e5w8XCl7aT0oh7lmAVvY'
)

const { data, error } = await supabase
    .from('issues')
    .select('id, title, category, status, heat_score, source_count, created_at')
    .ilike('title', '%방탄%')
    .limit(10)

if (error) {
    console.error('조회 오류:', error.message)
} else if (data.length === 0) {
    console.log('방탄 검색 결과 없음. 전체 최근 이슈 확인...')

    const { data: all } = await supabase
        .from('issues')
        .select('id, title, category, status, heat_score, source_count')
        .order('created_at', { ascending: false })
        .limit(20)

    console.log('\n최근 이슈 20건:')
    all?.forEach((issue, i) => {
        console.log(`[${i+1}] ${issue.title}`)
        console.log(`     ID: ${issue.id} | 카테고리: ${issue.category} | 상태: ${issue.status}`)
    })
} else {
    console.log(`\n검색 결과 ${data.length}건:`)
    data.forEach(issue => {
        console.log(`\n제목: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`카테고리: ${issue.category} | 상태: ${issue.status}`)
        console.log(`화력: ${issue.heat_score} | 출처: ${JSON.stringify(issue.source_count)}`)
    })
}
