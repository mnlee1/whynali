/**
 * scripts/cleanup-broken-timeline-summaries.ts
 * 
 * 잘못된 형식의 timeline_summaries 데이터 삭제
 * 
 * 실행 방법:
 * SUPABASE_URL=<실서버URL> SUPABASE_SERVICE_ROLE_KEY=<실서버키> npx tsx scripts/cleanup-broken-timeline-summaries.ts
 */

const PROD_SUPABASE_URL = process.env.SUPABASE_URL
const PROD_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

async function cleanupBrokenData() {
    if (!PROD_SUPABASE_URL || !PROD_SUPABASE_KEY) {
        console.error('환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }

    const supabase = createClient(PROD_SUPABASE_URL, PROD_SUPABASE_KEY)

    console.log('[잘못된 타임라인 데이터 정리] 시작...\n')

    // 1. timeline_summaries에서 bullets가 잘못된 데이터 조회
    const { data: summaries, error } = await supabase
        .from('timeline_summaries')
        .select('*')
        .order('generated_at', { ascending: false })

    if (error) {
        console.error('조회 실패:', error)
        return
    }

    console.log(`총 ${summaries?.length || 0}개 요약 데이터 확인 중...\n`)

    let deletedCount = 0
    let validCount = 0

    for (const summary of summaries || []) {
        const bullets = summary.bullets

        // bullets가 배열이 아니거나, 배열의 항목이 문자열이 아닌 경우
        let isInvalid = false

        if (!Array.isArray(bullets)) {
            console.log(`  ✗ [${summary.stage}] bullets가 배열이 아님: ${typeof bullets}`)
            isInvalid = true
        } else {
            // 배열 내부의 각 항목 검증
            for (const bullet of bullets) {
                if (typeof bullet !== 'string') {
                    console.log(`  ✗ [${summary.stage}] bullet이 문자열이 아님: ${typeof bullet}`)
                    isInvalid = true
                    break
                }
                // JSON 패턴이 포함된 경우 (예: {"타이틀": "...")
                if (bullet.includes('{"') || bullet.includes('타이틀":')) {
                    console.log(`  ✗ [${summary.stage}] JSON 패턴 발견: ${bullet.substring(0, 50)}...`)
                    isInvalid = true
                    break
                }
            }
        }

        if (isInvalid) {
            // 잘못된 데이터 삭제
            const { error: deleteError } = await supabase
                .from('timeline_summaries')
                .delete()
                .eq('id', summary.id)

            if (deleteError) {
                console.error(`  ❌ 삭제 실패 (${summary.id}):`, deleteError)
            } else {
                console.log(`  ✓ 삭제: ${summary.issue_id} [${summary.stage}]`)
                deletedCount++
            }
        } else {
            validCount++
        }
    }

    // 2. timeline_points에서 ai_summary가 JSON 패턴을 포함하는 데이터 삭제
    const { data: points, error: pointsError } = await supabase
        .from('timeline_points')
        .select('id, issue_id, stage, ai_summary')
        .not('ai_summary', 'is', null)

    if (pointsError) {
        console.error('timeline_points 조회 실패:', pointsError)
    } else {
        console.log(`\ntimeline_points ${points?.length || 0}개 확인 중...\n`)

        let pointsDeletedCount = 0

        for (const point of points || []) {
            const aiSummary = point.ai_summary

            // JSON 패턴이 포함된 경우
            if (aiSummary && (aiSummary.includes('{"') || aiSummary.includes('타이틀":'))) {
                const { error: deleteError } = await supabase
                    .from('timeline_points')
                    .update({ ai_summary: null })
                    .eq('id', point.id)

                if (deleteError) {
                    console.error(`  ❌ ai_summary 초기화 실패 (${point.id}):`, deleteError)
                } else {
                    console.log(`  ✓ ai_summary 초기화: ${point.id} [${point.stage}]`)
                    pointsDeletedCount++
                }
            }
        }

        console.log(`\ntimeline_points: ${pointsDeletedCount}개 ai_summary 초기화`)
    }

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('정리 완료!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`timeline_summaries: ${deletedCount}개 삭제, ${validCount}개 유지`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

cleanupBrokenData()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('치명적 에러:', error)
        process.exit(1)
    })
