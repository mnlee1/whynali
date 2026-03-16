/**
 * scripts/check_all_issues_status.ts
 * 
 * 전체 이슈 상태 확인 및 레거시 이슈 검증
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Issue {
    id: string
    title: string
    source_track: string | null
    heat_index: number | null
    created_heat_index: number | null
    approval_status: string
    status: string
    created_at: string
    category: string
}

async function checkAllIssues() {
    console.log('🔍 전체 이슈 상태 확인\n')
    
    // 전체 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, heat_index, created_heat_index, approval_status, status, created_at, category')
        .order('created_at', { ascending: false })
    
    if (error || !issues) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    console.log(`📊 총 ${issues.length}개 이슈\n`)
    
    // source_track별 분류
    const bySourceTrack: Record<string, Issue[]> = {
        'track_a': [],
        'manual': [],
        'null': []
    }
    
    issues.forEach(issue => {
        if (issue.source_track === 'track_a') {
            bySourceTrack['track_a'].push(issue)
        } else if (issue.source_track === 'manual') {
            bySourceTrack['manual'].push(issue)
        } else {
            bySourceTrack['null'].push(issue)
        }
    })
    
    console.log('📈 source_track 분포:')
    console.log(`  - track_a: ${bySourceTrack['track_a'].length}개`)
    console.log(`  - manual: ${bySourceTrack['manual'].length}개`)
    console.log(`  - null 또는 기타: ${bySourceTrack['null'].length}개\n`)
    
    // 레거시 이슈 (null 또는 track_a/manual이 아닌 것) 상세 확인
    if (bySourceTrack['null'].length > 0) {
        console.log('⚠️  레거시 이슈 (source_track이 null 또는 비표준):\n')
        
        for (let i = 0; i < Math.min(bySourceTrack['null'].length, 20); i++) {
            const issue = bySourceTrack['null'][i]
            
            // 뉴스, 커뮤니티, 타임라인 확인
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
            
            const { data: timelineData } = await supabase
                .from('timeline_points')
                .select('id')
                .eq('issue_id', issue.id)
            const timelineCount = timelineData?.length ?? 0
            
            console.log(`${i + 1}. "${issue.title}"`)
            console.log(`   ID: ${issue.id}`)
            console.log(`   source_track: ${issue.source_track ?? 'NULL'}`)
            console.log(`   카테고리: ${issue.category}`)
            console.log(`   상태: ${issue.status} / 승인: ${issue.approval_status}`)
            console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            console.log(`   화력: ${issue.heat_index ?? 'N/A'}점 (등록시: ${issue.created_heat_index ?? 'N/A'}점)`)
            console.log(`   연결: 뉴스 ${newsCount}건 / 커뮤니티 ${communityCount}건 / 타임라인 ${timelineCount}개`)
            console.log()
        }
        
        if (bySourceTrack['null'].length > 20) {
            console.log(`... 외 ${bySourceTrack['null'].length - 20}개 더\n`)
        }
    }
    
    // 승인 상태별 통계
    const byApprovalStatus: Record<string, number> = {}
    issues.forEach(issue => {
        byApprovalStatus[issue.approval_status] = (byApprovalStatus[issue.approval_status] || 0) + 1
    })
    
    console.log('📊 승인 상태별 분포:')
    Object.entries(byApprovalStatus).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count}개`)
    })
    console.log()
    
    // 정리 제안
    if (bySourceTrack['null'].length > 0) {
        console.log('💡 제안:')
        console.log('  레거시 이슈들은 트랙 A 프로세스를 거치지 않은 이슈입니다.')
        console.log('  이들을 정리하려면:')
        console.log('  1. source_track을 "manual"로 업데이트 (수동 생성 이슈로 분류)')
        console.log('  2. 또는 삭제 (레거시 데이터 정리)')
        console.log()
        console.log('  실행: npx tsx scripts/cleanup_legacy_issues.ts')
    }
}

checkAllIssues()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
