/**
 * scripts/check-timeline-status.ts
 * 
 * Track A 이슈들의 타임라인 상태를 확인하는 스크립트
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTimelineStatus() {
    console.log('=== Track A 이슈 타임라인 상태 확인 ===\n')
    
    // 1. Track A 이슈 목록 조회
    const { data: issues, error: issuesError } = await supabase
        .from('issues')
        .select('id, title, source_track, approval_status, created_at')
        .eq('source_track', 'track_a')
        .order('created_at', { ascending: false })
        .limit(10)
    
    if (issuesError) {
        console.error('이슈 조회 에러:', issuesError)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('Track A 이슈가 없습니다.')
        return
    }
    
    console.log(`총 ${issues.length}개의 Track A 이슈 확인\n`)
    
    // 2. 각 이슈별 타임라인 개수 확인
    for (const issue of issues) {
        const { data: timeline, error: timelineError } = await supabase
            .from('timeline_points')
            .select('*')
            .eq('issue_id', issue.id)
            .order('occurred_at', { ascending: true })
        
        if (timelineError) {
            console.error(`[${issue.id}] 타임라인 조회 에러:`, timelineError)
            continue
        }
        
        const timelineCount = timeline?.length ?? 0
        const status = timelineCount > 0 ? '✅' : '❌'
        
        console.log(`${status} [${issue.approval_status}] ${issue.title}`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   타임라인: ${timelineCount}개`)
        
        if (timelineCount > 0) {
            timeline?.forEach((point, index) => {
                console.log(`   ${index + 1}. [${point.stage}] ${point.title || '(제목 없음)'}`)
                console.log(`      시간: ${point.occurred_at}`)
                console.log(`      출처: ${point.source_url || '(없음)'}`)
            })
        }
        
        console.log('')
    }
    
    // 3. 전체 통계
    const { data: stats } = await supabase.rpc('get_timeline_stats', {}, {
        count: 'exact'
    }).single().catch(() => ({ data: null }))
    
    const { count: totalIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('source_track', 'track_a')
    
    const { count: issuesWithTimeline } = await supabase
        .from('issues')
        .select('*, timeline_points!inner(id)', { count: 'exact', head: true })
        .eq('source_track', 'track_a')
    
    console.log('=== 전체 통계 ===')
    console.log(`Track A 이슈 총 개수: ${totalIssues ?? 0}개`)
    console.log(`타임라인 있는 이슈: ${issuesWithTimeline ?? 0}개`)
    console.log(`타임라인 없는 이슈: ${(totalIssues ?? 0) - (issuesWithTimeline ?? 0)}개`)
}

checkTimelineStatus()
    .then(() => {
        console.log('\n✅ 확인 완료')
        process.exit(0)
    })
    .catch((error) => {
        console.error('❌ 에러 발생:', error)
        process.exit(1)
    })
