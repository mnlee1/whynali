/**
 * scripts/cleanup_duplicate_issues.ts
 * 
 * [중복 이슈 정리 스크립트]
 * 
 * 같은 제목의 이슈가 24시간 내에 여러 번 등록된 경우,
 * 가장 먼저 생성된 이슈만 남기고 나머지는 삭제합니다.
 * 
 * 실행:
 * NODE_OPTIONS='--env-file=.env.local' npx tsx scripts/cleanup_duplicate_issues.ts
 */

import { supabaseAdmin } from '../lib/supabase/server'

interface DuplicateGroup {
    title: string
    issues: Array<{
        id: string
        created_at: string
        approval_status: string
        heat_index: number | null
    }>
}

async function cleanupDuplicateIssues() {
    console.log('=== 중복 이슈 정리 시작 ===\n')
    
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // 1. 최근 24시간 내 모든 이슈 조회
    const { data: recentIssues, error: fetchError } = await supabaseAdmin
        .from('issues')
        .select('id, title, created_at, approval_status, heat_index')
        .gte('created_at', since24h)
        .order('created_at', { ascending: true })
    
    if (fetchError) {
        console.error('이슈 조회 실패:', fetchError)
        return
    }
    
    if (!recentIssues || recentIssues.length === 0) {
        console.log('최근 24시간 내 이슈 없음')
        return
    }
    
    console.log(`최근 24시간 이슈: ${recentIssues.length}건\n`)
    
    // 2. 제목별로 그룹핑
    const titleGroups = new Map<string, DuplicateGroup['issues']>()
    
    for (const issue of recentIssues) {
        if (!titleGroups.has(issue.title)) {
            titleGroups.set(issue.title, [])
        }
        titleGroups.get(issue.title)!.push(issue)
    }
    
    // 3. 중복된 그룹만 필터링 (2개 이상)
    const duplicateGroups: DuplicateGroup[] = []
    
    for (const [title, issues] of titleGroups.entries()) {
        if (issues.length > 1) {
            duplicateGroups.push({ title, issues })
        }
    }
    
    if (duplicateGroups.length === 0) {
        console.log('✅ 중복 이슈 없음')
        return
    }
    
    console.log(`🔍 중복 발견: ${duplicateGroups.length}개 제목\n`)
    
    // 4. 각 그룹별로 처리
    let totalDeleted = 0
    let totalMerged = 0
    
    for (const group of duplicateGroups) {
        console.log(`\n제목: "${group.title}"`)
        console.log(`중복 건수: ${group.issues.length}건`)
        
        // 정렬: 1) 승인 상태 우선, 2) 화력 높은 순, 3) 먼저 생성된 순
        group.issues.sort((a, b) => {
            // 승인된 이슈 우선
            if (a.approval_status === '승인' && b.approval_status !== '승인') return -1
            if (a.approval_status !== '승인' && b.approval_status === '승인') return 1
            
            // 화력 높은 순
            const heatA = a.heat_index ?? 0
            const heatB = b.heat_index ?? 0
            if (heatB !== heatA) return heatB - heatA
            
            // 먼저 생성된 순
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
        
        const keepIssue = group.issues[0]
        const deleteIssues = group.issues.slice(1)
        
        console.log(`  ✓ 유지: ID=${keepIssue.id.substring(0, 8)}... (${keepIssue.approval_status}, 화력: ${keepIssue.heat_index ?? 0})`)
        
        for (const issue of deleteIssues) {
            console.log(`  ✗ 삭제: ID=${issue.id.substring(0, 8)}... (${issue.approval_status}, 화력: ${issue.heat_index ?? 0})`)
            
            // 삭제할 이슈의 수집 건을 유지할 이슈로 이동
            const { error: newsError } = await supabaseAdmin
                .from('news_data')
                .update({ issue_id: keepIssue.id })
                .eq('issue_id', issue.id)
            
            if (newsError) {
                console.error(`    뉴스 이동 실패:`, newsError)
            }
            
            const { error: communityError } = await supabaseAdmin
                .from('community_data')
                .update({ issue_id: keepIssue.id })
                .eq('issue_id', issue.id)
            
            if (communityError) {
                console.error(`    커뮤니티 이동 실패:`, communityError)
            }
            
            // 이슈 삭제
            const { error: deleteError } = await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', issue.id)
            
            if (deleteError) {
                console.error(`    이슈 삭제 실패:`, deleteError)
            } else {
                totalDeleted++
            }
        }
        
        totalMerged++
    }
    
    console.log(`\n=== 정리 완료 ===`)
    console.log(`병합된 그룹: ${totalMerged}개`)
    console.log(`삭제된 이슈: ${totalDeleted}건`)
}

// 실행
cleanupDuplicateIssues()
    .then(() => {
        console.log('\n스크립트 종료')
        process.exit(0)
    })
    .catch(error => {
        console.error('\n스크립트 에러:', error)
        process.exit(1)
    })
