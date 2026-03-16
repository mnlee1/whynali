/**
 * scripts/cleanup_legacy_issues.ts
 * 
 * 레거시 이슈 정리 스크립트
 * 
 * 트랙 A 기준에 맞지 않는 이슈들을 정리합니다:
 * - source_track이 null인 이슈
 * - 커뮤니티 글이 0건인 이슈 (트랙 A는 최소 1건 필수)
 * - 뉴스가 0건인 이슈
 * - 타임라인이 없는 이슈
 * - 화력 15점 미만 이슈
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

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
}

interface IssueToDelete {
    issue: Issue
    reasons: string[]
    newsCount: number
    communityCount: number
    timelineCount: number
}

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    
    return new Promise(resolve => rl.question(query, ans => {
        rl.close()
        resolve(ans)
    }))
}

async function cleanupLegacyIssues() {
    console.log('🧹 레거시 이슈 정리 시작\n')
    
    // 전체 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, heat_index, created_heat_index, approval_status, status, created_at')
        .order('created_at', { ascending: false })
    
    if (error || !issues) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    console.log(`📊 총 ${issues.length}개 이슈 확인 중...\n`)
    
    const issuesToDelete: IssueToDelete[] = []
    
    // 각 이슈 검증
    for (const issue of issues) {
        const reasons: string[] = []
        
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
        
        // 정리 대상 판단
        if (!issue.source_track || issue.source_track === 'null') {
            reasons.push('source_track이 NULL (레거시 이슈)')
        }
        
        if (communityCount === 0) {
            reasons.push('커뮤니티 글 0건 (트랙 A는 1건 이상 필수)')
        }
        
        if (newsCount === 0) {
            reasons.push('뉴스 0건')
        }
        
        if (timelineCount === 0) {
            reasons.push('타임라인 없음')
        }
        
        const heatToCheck = issue.created_heat_index ?? issue.heat_index ?? 0
        if (heatToCheck < 15) {
            reasons.push(`화력 ${heatToCheck}점 (최소 15점 필요)`)
        }
        
        // 정리 대상으로 추가
        if (reasons.length > 0) {
            issuesToDelete.push({
                issue,
                reasons,
                newsCount,
                communityCount,
                timelineCount
            })
        }
    }
    
    if (issuesToDelete.length === 0) {
        console.log('✅ 정리할 레거시 이슈가 없습니다!\n')
        return
    }
    
    // 정리 대상 출력
    console.log(`⚠️  ${issuesToDelete.length}개 이슈를 정리합니다:\n`)
    
    issuesToDelete.forEach((item, index) => {
        console.log(`${index + 1}. "${item.issue.title}"`)
        console.log(`   ID: ${item.issue.id}`)
        console.log(`   source_track: ${item.issue.source_track ?? 'NULL'}`)
        console.log(`   생성일: ${new Date(item.issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`   승인 상태: ${item.issue.approval_status}`)
        console.log(`   화력: ${item.issue.heat_index ?? 'N/A'}점`)
        console.log(`   연결: 뉴스 ${item.newsCount}건 / 커뮤니티 ${item.communityCount}건 / 타임라인 ${item.timelineCount}개`)
        console.log(`   ❌ 정리 사유: ${item.reasons.join(', ')}`)
        console.log()
    })
    
    // 사용자 확인
    const answer = await askQuestion('정말로 이 이슈들을 삭제하시겠습니까? (yes/no): ')
    
    if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ 취소되었습니다.')
        return
    }
    
    console.log('\n🗑️  이슈 삭제 시작...\n')
    
    let successCount = 0
    let failCount = 0
    
    // 이슈 삭제
    for (const item of issuesToDelete) {
        try {
            const { error: deleteError } = await supabase
                .from('issues')
                .delete()
                .eq('id', item.issue.id)
            
            if (deleteError) {
                console.error(`  ✗ "${item.issue.title}" 삭제 실패:`, deleteError.message)
                failCount++
            } else {
                console.log(`  ✓ "${item.issue.title}" 삭제 완료`)
                successCount++
            }
        } catch (error) {
            console.error(`  ✗ "${item.issue.title}" 삭제 중 오류:`, error)
            failCount++
        }
    }
    
    console.log('\n📊 정리 완료:')
    console.log(`  - 성공: ${successCount}개`)
    console.log(`  - 실패: ${failCount}개`)
    console.log()
    
    if (successCount > 0) {
        console.log('✅ 레거시 이슈 정리가 완료되었습니다.')
        console.log('   이제 관리자 페이지에는 트랙 A 기준을 충족하는 이슈만 표시됩니다.')
    }
}

cleanupLegacyIssues()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
