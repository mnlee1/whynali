/**
 * 실서버 DB에 ai_summary가 실제로 저장되었는지 확인
 */

import { createClient } from '@supabase/supabase-js'

async function checkProductionData() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('[실서버 타임라인 AI 요약 확인]\n')

    // 최근 활성 이슈 1개 조회
    const { data: issue } = await supabase
        .from('issues')
        .select('id, title')
        .eq('approval_status', '승인')
        .in('status', ['점화', '논란중'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!issue) {
        console.error('❌ 활성 이슈가 없습니다')
        return
    }

    console.log(`이슈: "${issue.title}"\n`)

    // 타임라인 포인트 조회
    const { data: points } = await supabase
        .from('timeline_points')
        .select('id, title, ai_summary, occurred_at')
        .eq('issue_id', issue.id)
        .order('occurred_at', { ascending: false })
        .limit(5)

    if (!points || points.length === 0) {
        console.log('타임라인 포인트가 없습니다')
        return
    }

    console.log(`타임라인 포인트 ${points.length}개:\n`)

    let hasAiSummary = 0
    let noAiSummary = 0

    for (const point of points) {
        console.log(`제목: ${point.title}`)
        if (point.ai_summary) {
            console.log(`✓ AI 요약: ${point.ai_summary}`)
            hasAiSummary++
        } else {
            console.log(`✗ AI 요약: (없음)`)
            noAiSummary++
        }
        console.log('---\n')
    }

    console.log(`\n통계:`)
    console.log(`- AI 요약 있음: ${hasAiSummary}개`)
    console.log(`- AI 요약 없음: ${noAiSummary}개`)
}

checkProductionData()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('에러:', error)
        process.exit(1)
    })
