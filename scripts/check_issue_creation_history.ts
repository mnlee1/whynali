/**
 * scripts/check_issue_creation_history.ts
 * 
 * 특정 이슈의 생성 과정 추적
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    const issueId = '8a2e09a8-8fc1-41f5-99d7-3897931fb870'
    
    console.log('이슈 생성 과정 추적 중...\n')
    console.log(`이슈 ID: ${issueId}\n`)
    
    // 이슈 정보
    const { data: issue, error: issueError } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    if (issueError || !issue) {
        console.error('이슈 조회 실패:', issueError)
        return
    }
    
    console.log('=== 이슈 정보 ===')
    console.log(`제목: ${issue.title}`)
    console.log(`카테고리: ${issue.category}`)
    console.log(`상태: ${issue.status}`)
    console.log(`승인 상태: ${issue.approval_status}`)
    console.log(`승인 타입: ${issue.approval_type ?? 'null'}`)
    console.log(`Source Track: ${issue.source_track ?? 'null'}`)
    console.log(`화력: ${issue.heat_index ?? 'N/A'}`)
    console.log(`생성 화력: ${issue.created_heat_index ?? 'N/A'}`)
    console.log(`생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
    console.log(`승인일: ${issue.approved_at ? new Date(issue.approved_at).toLocaleString('ko-KR') : 'N/A'}`)
    
    // 연결된 뉴스
    const { data: newsData } = await supabase
        .from('news_data')
        .select('id, title, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: true })
    
    console.log(`\n=== 연결된 뉴스: ${newsData?.length ?? 0}건 ===`)
    if (newsData && newsData.length > 0) {
        console.log(`최초 뉴스: ${newsData[0].title}`)
        console.log(`발행일: ${new Date(newsData[0].published_at).toLocaleString('ko-KR')}`)
    }
    
    // 연결된 커뮤니티
    const { data: communityData } = await supabase
        .from('community_data')
        .select('id, title, created_at')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: true })
    
    console.log(`\n=== 연결된 커뮤니티: ${communityData?.length ?? 0}건 ===`)
    
    // 타임라인
    const { data: timelineData } = await supabase
        .from('timeline_points')
        .select('*')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })
    
    console.log(`\n=== 타임라인: ${timelineData?.length ?? 0}개 포인트 ===`)
    if (timelineData && timelineData.length > 0) {
        console.log(`최초 타임라인: ${timelineData[0].title}`)
        console.log(`발생일: ${new Date(timelineData[0].occurred_at).toLocaleString('ko-KR')}`)
    }
    
    // 관리자 로그 확인
    const { data: adminLogs } = await supabase
        .from('admin_action_logs')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: true })
    
    console.log(`\n=== 관리자 로그: ${adminLogs?.length ?? 0}건 ===`)
    if (adminLogs && adminLogs.length > 0) {
        for (const log of adminLogs) {
            console.log(`\n- 액션: ${log.action}`)
            console.log(`  시간: ${new Date(log.created_at).toLocaleString('ko-KR')}`)
            console.log(`  세부: ${log.details ?? 'N/A'}`)
        }
    }
    
    // 분석
    console.log('\n' + '='.repeat(80))
    console.log('\n=== 원인 분석 ===\n')
    
    if (issue.source_track === null) {
        console.log('⚠️ source_track이 null입니다.')
        console.log('\n가능한 원인:')
        console.log('1. 수동 생성 API가 source_track을 설정하지 않음')
        console.log('2. 관리자 페이지에서 생성 시 source_track 누락')
        console.log('3. 다른 크론 잡이 source_track을 설정하지 않음')
        console.log('4. 데이터베이스 마이그레이션 시 기본값 누락')
        
        if (issue.approval_type === 'manual' || issue.approval_type === null) {
            console.log('\n✓ approval_type이 manual 또는 null → 수동 생성 가능성 높음')
        }
        
        if (communityData?.length === 0) {
            console.log('\n✓ 커뮤니티 글 0건 → 트랙A가 아닌 다른 경로로 생성됨')
        }
    }
}

main().catch(console.error)
