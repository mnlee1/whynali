/**
 * scripts/cleanup-broken-timeline-points.ts
 * 
 * JSON 패턴이 포함된 ai_summary 데이터 삭제
 * 
 * 실행 방법:
 * SUPABASE_URL=<실서버URL> SUPABASE_SERVICE_ROLE_KEY=<실서버키> npx tsx scripts/cleanup-broken-timeline-points.ts
 */

const PROD_SUPABASE_URL = process.env.SUPABASE_URL
const PROD_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

async function cleanupBrokenTimelinePoints() {
    if (!PROD_SUPABASE_URL || !PROD_SUPABASE_KEY) {
        console.error('환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }

    const supabase = createClient(PROD_SUPABASE_URL, PROD_SUPABASE_KEY)

    console.log('[JSON 패턴 포함 timeline_points 정리] 시작...\n')

    // ai_summary가 JSON 패턴을 포함하는 timeline_points 조회
    const { data: points, error } = await supabase
        .from('timeline_points')
        .select('id, issue_id, stage, title, ai_summary')
        .not('ai_summary', 'is', null)

    if (error) {
        console.error('조회 실패:', error)
        return
    }

    console.log(`총 ${points?.length || 0}개 포인트 확인 중...\n`)

    let cleanedCount = 0
    let validCount = 0

    for (const point of points || []) {
        const aiSummary = point.ai_summary

        // JSON 패턴이 포함된 경우 ({"타이틀" 또는 {"index" 등)
        if (aiSummary && (aiSummary.includes('{"') || aiSummary.includes('타이틀":') || aiSummary.includes('설명":'))) {
            const { error: updateError } = await supabase
                .from('timeline_points')
                .update({ ai_summary: null })
                .eq('id', point.id)

            if (updateError) {
                console.error(`  ❌ 초기화 실패 (${point.id}):`, updateError)
            } else {
                console.log(`  ✓ 초기화: [${point.stage}] ${point.title.substring(0, 50)}...`)
                cleanedCount++
            }
        } else {
            validCount++
        }
    }

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('정리 완료!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`${cleanedCount}개 ai_summary 초기화 (JSON 패턴 제거)`)
    console.log(`${validCount}개 유지 (정상 데이터)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

cleanupBrokenTimelinePoints()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('치명적 에러:', error)
        process.exit(1)
    })
