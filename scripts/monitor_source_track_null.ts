/**
 * scripts/monitor_source_track_null.ts
 * 
 * [Source Track Null 모니터링]
 * 
 * 최근 생성된 이슈 중 source_track이 null인 이슈를 감지합니다.
 * null 이슈가 발견되면 exit code 1로 종료하여 GitHub Actions가 실패하도록 합니다.
 * 
 * 실행 주기: 매일 오전 10시 (KST)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface Issue {
    id: string
    title: string
    source_track: string | null
    created_at: string
    approval_status: string
    status: string
    heat_index: number | null
}

async function monitorSourceTrackNull() {
    console.log('═'.repeat(80))
    console.log('Source Track Null 이슈 모니터링')
    console.log('═'.repeat(80))
    console.log('')

    // 최근 7일간 생성된 이슈 조회
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    console.log(`📅 조회 기간: ${sevenDaysAgo.toISOString().split('T')[0]} ~ 현재`)
    console.log('')

    const { data: recentIssues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, created_at, approval_status, status, heat_index')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })

    if (error) {
        console.error('❌ 이슈 조회 실패:', error)
        process.exit(1)
    }

    if (!recentIssues || recentIssues.length === 0) {
        console.log('📊 최근 7일간 생성된 이슈가 없습니다.')
        console.log('✅ 모니터링 완료')
        process.exit(0)
    }

    // source_track이 null인 이슈 필터링
    const nullIssues = recentIssues.filter(
        (issue: Issue) => issue.source_track === null || issue.source_track === undefined
    )

    console.log(`📊 최근 7일 통계:`)
    console.log(`   - 전체 이슈: ${recentIssues.length}개`)
    console.log(`   - source_track null: ${nullIssues.length}개`)
    console.log('')

    if (nullIssues.length === 0) {
        console.log('✅ source_track이 null인 이슈가 없습니다.')
        console.log('✅ 모니터링 완료')
        process.exit(0)
    }

    // null 이슈 발견 시 상세 정보 출력
    console.log('⚠️  경고: source_track이 null인 이슈를 발견했습니다!')
    console.log('')
    console.log('─'.repeat(80))
    console.log('발견된 이슈 목록:')
    console.log('─'.repeat(80))
    console.log('')

    for (let i = 0; i < nullIssues.length; i++) {
        const issue = nullIssues[i]
        
        // 연결된 커뮤니티 및 뉴스 데이터 확인
        const { data: newsData } = await supabase
            .from('news_data')
            .select('id')
            .eq('issue_id', issue.id)
        const newsCount = newsData?.length ?? 0

        const { data: communityData } = await supabase
            .from('community_data')
            .select('id')
            .eq('issue_id', issue.id)
        const communityCount = communityData?.length ?? 0

        console.log(`${i + 1}. 제목: ${issue.title}`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`   상태: ${issue.status} / 승인: ${issue.approval_status}`)
        console.log(`   화력: ${issue.heat_index ?? 'N/A'}점`)
        console.log(`   연결: 뉴스 ${newsCount}건 / 커뮤니티 ${communityCount}건`)
        console.log('')
    }

    console.log('─'.repeat(80))
    console.log('')
    console.log('💡 조치 방법:')
    console.log('   1. 이슈가 수동으로 생성된 경우:')
    console.log('      → npx tsx scripts/fix_all_null_source_track.ts')
    console.log('')
    console.log('   2. 이슈를 삭제해야 하는 경우:')
    console.log('      → npx tsx scripts/delete_null_source_track_issues.ts')
    console.log('')
    console.log('   3. 트랙A 프로세스 문제인 경우:')
    console.log('      → 트랙A 크론 로직 점검 필요')
    console.log('')
    console.log('═'.repeat(80))
    console.log('❌ 모니터링 실패: source_track null 이슈 발견')
    console.log('═'.repeat(80))

    // exit code 1로 종료하여 GitHub Actions 워크플로우를 실패시킴
    process.exit(1)
}

monitorSourceTrackNull().catch(error => {
    console.error('❌ 실행 오류:', error)
    process.exit(1)
})
