/**
 * scripts/check-issue-status.ts
 * 
 * 이슈 현황 확인
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function checkIssueStatus() {
    const issueId = '82acb5c8-b0fc-4396-aa3a-3273db8b366b'
    
    const { data, error } = await supabase
        .from('issues')
        .select('status, heat_index, view_count, updated_at, created_at')
        .eq('id', issueId)
        .single()
    
    if (error || !data) {
        console.log('이슈를 찾을 수 없습니다.')
        return
    }
    
    console.log('=== 이슈 현황 ===\n')
    console.log('상태:', data.status)
    console.log('화력:', data.heat_index)
    console.log('조회수:', data.view_count || 0)
    console.log('생성:', new Date(data.created_at).toLocaleString('ko-KR'))
    console.log('업데이트:', new Date(data.updated_at).toLocaleString('ko-KR'))
    console.log()
    
    const daysSinceCreated = Math.floor((Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24))
    const daysSinceUpdated = Math.floor((Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    
    console.log('생성 후 경과:', daysSinceCreated + '일')
    console.log('업데이트 후 경과:', daysSinceUpdated + '일')
    console.log()
    
    // 수동 정리 필요성 판단
    console.log('━'.repeat(50))
    console.log('\n💡 수동 정리 필요성 판단:\n')
    
    const reasons = []
    
    // 활성 상태 체크
    if (data.status === '논란중' || data.status === '점화') {
        reasons.push('✓ 활성 상태 (' + data.status + ')')
    } else {
        console.log('✗ 비활성 상태 (' + data.status + ')')
    }
    
    // 화력 체크
    if (data.heat_index > 50) {
        reasons.push('✓ 높은 화력 (' + data.heat_index + ')')
    } else {
        console.log('✗ 낮은 화력 (' + data.heat_index + ')')
    }
    
    // 최신성 체크
    if (daysSinceCreated <= 3) {
        reasons.push('✓ 최근 이슈 (' + daysSinceCreated + '일 전)')
    } else {
        console.log('✗ 오래된 이슈 (' + daysSinceCreated + '일 전)')
    }
    
    // 조회수 체크
    if (data.view_count > 100) {
        reasons.push('✓ 많은 조회수 (' + data.view_count + ')')
    } else if (data.view_count > 0) {
        console.log('△ 보통 조회수 (' + (data.view_count || 0) + ')')
    } else {
        console.log('✗ 조회수 없음')
    }
    
    console.log()
    
    if (reasons.length > 0) {
        console.log('수동 정리 필요한 이유:')
        reasons.forEach(r => console.log('  ' + r))
        console.log()
    }
    
    // 최종 판단
    if (reasons.length >= 2) {
        console.log('🔴 결론: 수동 정리 권장')
        console.log('   사용자에게 노출될 가능성이 높음')
    } else if (reasons.length === 1) {
        console.log('🟡 결론: 수동 정리 선택사항')
        console.log('   시급하지 않지만 정리하면 좋음')
    } else {
        console.log('🟢 결론: 수동 정리 불필요')
        console.log('   1단계만 적용하면 충분함')
    }
}

checkIssueStatus().catch(console.error)
