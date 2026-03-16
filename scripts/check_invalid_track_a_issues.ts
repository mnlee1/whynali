/**
 * scripts/check_invalid_track_a_issues.ts
 * 
 * 트랙 A 기준에 맞지 않는 이슈 검증
 * 
 * 트랙 A 이슈는 다음 조건을 모두 만족해야 함:
 * 1. source_track = 'track_a'
 * 2. 화력 15점 이상 (created_heat_index 또는 heat_index)
 * 3. 뉴스 1건 이상 연결
 * 4. 커뮤니티 글 1건 이상 연결
 * 5. 타임라인 1개 이상
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
    console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
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
    created_at: string
}

interface ValidationResult {
    issue: Issue
    problems: string[]
    newsCount: number
    communityCount: number
    timelineCount: number
}

async function checkInvalidIssues() {
    console.log('🔍 트랙 A 이슈 검증 시작\n')
    
    // 트랙 A 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, heat_index, created_heat_index, approval_status, created_at')
        .eq('source_track', 'track_a')
        .order('created_at', { ascending: false })
    
    if (error || !issues) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    console.log(`📊 총 ${issues.length}개 트랙 A 이슈 발견\n`)
    
    const invalidIssues: ValidationResult[] = []
    
    for (const issue of issues) {
        const problems: string[] = []
        
        // 1. 뉴스 연결 확인
        const { data: newsData } = await supabase
            .from('news_data')
            .select('id')
            .eq('issue_id', issue.id)
        const newsCount = newsData?.length ?? 0
        
        if (newsCount === 0) {
            problems.push('뉴스 0건')
        }
        
        // 2. 커뮤니티 연결 확인
        const { data: communityData } = await supabase
            .from('community_data')
            .select('id')
            .eq('issue_id', issue.id)
        const communityCount = communityData?.length ?? 0
        
        if (communityCount === 0) {
            problems.push('커뮤니티 0건')
        }
        
        // 3. 타임라인 확인
        const { data: timelineData } = await supabase
            .from('timeline_points')
            .select('id')
            .eq('issue_id', issue.id)
        const timelineCount = timelineData?.length ?? 0
        
        if (timelineCount === 0) {
            problems.push('타임라인 없음')
        }
        
        // 4. 화력 확인 (등록 시점 또는 현재 화력)
        const heatToCheck = issue.created_heat_index ?? issue.heat_index ?? 0
        if (heatToCheck < 15) {
            problems.push(`화력 ${heatToCheck}점 (최소 15점)`)
        }
        
        if (problems.length > 0) {
            invalidIssues.push({
                issue,
                problems,
                newsCount,
                communityCount,
                timelineCount
            })
        }
    }
    
    // 결과 출력
    if (invalidIssues.length === 0) {
        console.log('✅ 모든 트랙 A 이슈가 기준을 충족합니다!\n')
        return
    }
    
    console.log(`⚠️  ${invalidIssues.length}개 이슈가 기준 미달:\n`)
    
    invalidIssues.forEach((result, index) => {
        console.log(`${index + 1}. "${result.issue.title}"`)
        console.log(`   ID: ${result.issue.id}`)
        console.log(`   생성일: ${new Date(result.issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`   승인 상태: ${result.issue.approval_status}`)
        console.log(`   화력: 등록시 ${result.issue.created_heat_index ?? 'N/A'}점 / 현재 ${result.issue.heat_index ?? 'N/A'}점`)
        console.log(`   연결: 뉴스 ${result.newsCount}건 / 커뮤니티 ${result.communityCount}건 / 타임라인 ${result.timelineCount}개`)
        console.log(`   ❌ 문제: ${result.problems.join(', ')}`)
        console.log()
    })
    
    // 요약 통계
    console.log('📈 문제 유형별 통계:')
    const problemTypes = {
        '뉴스 0건': 0,
        '커뮤니티 0건': 0,
        '타임라인 없음': 0,
        '화력 부족': 0
    }
    
    invalidIssues.forEach(result => {
        if (result.problems.some(p => p.includes('뉴스'))) problemTypes['뉴스 0건']++
        if (result.problems.some(p => p.includes('커뮤니티'))) problemTypes['커뮤니티 0건']++
        if (result.problems.some(p => p.includes('타임라인'))) problemTypes['타임라인 없음']++
        if (result.problems.some(p => p.includes('화력'))) problemTypes['화력 부족']++
    })
    
    Object.entries(problemTypes).forEach(([type, count]) => {
        if (count > 0) {
            console.log(`  - ${type}: ${count}개`)
        }
    })
    
    console.log('\n💡 제안:')
    console.log('  이러한 이슈들은 트랙 A 프로세스를 정상적으로 거치지 않은 것으로 보입니다.')
    console.log('  scripts/cleanup_invalid_track_a_issues.ts를 실행하여 정리할 수 있습니다.')
}

checkInvalidIssues()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
