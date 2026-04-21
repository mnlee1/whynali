/**
 * scripts/check-timeline-points.ts
 * 
 * timeline_points의 ai_summary 데이터 확인
 */

const PROD_SUPABASE_URL = process.env.SUPABASE_URL
const PROD_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

async function checkTimelinePoints() {
    if (!PROD_SUPABASE_URL || !PROD_SUPABASE_KEY) {
        console.error('환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }

    const supabase = createClient(PROD_SUPABASE_URL, PROD_SUPABASE_KEY)

    console.log('[timeline_points 데이터 확인] 시작...\n')

    // 1. ai_summary가 있는 timeline_points 조회
    const { data: points, error } = await supabase
        .from('timeline_points')
        .select('id, title, stage, ai_summary, issue_id')
        .not('ai_summary', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(20)

    if (error) {
        console.error('조회 실패:', error)
        return
    }

    console.log(`총 ${points?.length || 0}개 포인트 확인\n`)

    for (const point of points || []) {
        console.log(`\n[${point.stage}] ${point.title}`)
        console.log(`ai_summary: ${point.ai_summary?.substring(0, 200)}...`)
        
        // JSON 패턴 확인
        if (point.ai_summary && (point.ai_summary.includes('{"') || point.ai_summary.includes('타이틀":'))) {
            console.log('  ✗ JSON 패턴 발견!')
        }
    }

    // 2. 특정 이슈 ("국힘 지지율 18% 최저치") 데이터 확인
    const { data: issues } = await supabase
        .from('issues')
        .select('id, title')
        .ilike('title', '%지지율%18%')
        .limit(1)
        .single()

    if (issues) {
        console.log(`\n\n=== "${issues.title}" 이슈의 timeline_points ===\n`)
        
        const { data: issuePoints } = await supabase
            .from('timeline_points')
            .select('*')
            .eq('issue_id', issues.id)
            .order('occurred_at')

        issuePoints?.forEach((p, i) => {
            console.log(`\n${i + 1}. [${p.stage}] ${p.title}`)
            if (p.ai_summary) {
                console.log(`   ai_summary: ${p.ai_summary.substring(0, 150)}...`)
            } else {
                console.log(`   ai_summary: null`)
            }
        })
    }
}

checkTimelinePoints()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('치명적 에러:', error)
        process.exit(1)
    })
