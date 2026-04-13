/**
 * scripts/fix-issue-timeline.ts
 * 
 * "전시 살해 논란" 이슈의 잘못된 타임라인 포인트 삭제
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function fixTimeline() {
    console.log('=== 타임라인 수정 시작 ===\n')
    
    // 삭제할 타임라인 포인트 ID
    const idsToDelete = [
        'da7bb8d3-f286-4e1c-85a1-f929f8faf9a8',  // 이란 스포츠장관
        'c83bcef8-7543-4bab-8e4c-65159b860c84',  // 그것이알고싶다
        '88f0f8b4-3c67-409a-ab96-3be157a77af4',  // 전남도청 전시
        'c03e1b7e-3a57-45ce-9238-b66ad09adc83',  // 데미안 허스트
        '5e0783b3-dce6-4baa-86f2-54530ef80153',  // 국현미 회고전
    ]
    
    console.log(`삭제할 타임라인 포인트: ${idsToDelete.length}개\n`)
    
    // 삭제 전 확인
    const { data: beforeDelete, error: selectError } = await supabase
        .from('timeline_points')
        .select('id, title')
        .in('id', idsToDelete)
    
    if (selectError) {
        console.error('조회 에러:', selectError)
        return
    }
    
    console.log('삭제될 타임라인:\n')
    beforeDelete?.forEach((point, idx) => {
        console.log(`${idx + 1}. ${point.title}`)
        console.log(`   ID: ${point.id}`)
    })
    console.log()
    
    // 삭제 실행
    const { error: deleteError, count } = await supabase
        .from('timeline_points')
        .delete({ count: 'exact' })
        .in('id', idsToDelete)
    
    if (deleteError) {
        console.error('❌ 삭제 에러:', deleteError)
        return
    }
    
    console.log('━'.repeat(50))
    console.log(`\n✅ 삭제 완료: ${count}개 타임라인 포인트\n`)
    
    // 남은 타임라인 확인
    const issueId = '82acb5c8-b0fc-4396-aa3a-3273db8b366b'
    const { data: remaining, error: remainingError } = await supabase
        .from('timeline_points')
        .select('title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })
    
    if (remainingError) {
        console.error('남은 타임라인 조회 에러:', remainingError)
        return
    }
    
    console.log(`남은 타임라인: ${remaining?.length || 0}개\n`)
    remaining?.forEach((point, idx) => {
        console.log(`${idx + 1}. ${point.title}`)
        console.log(`   ${new Date(point.occurred_at).toLocaleString('ko-KR')}`)
    })
    
    console.log('\n✅ 타임라인 수정 완료!')
}

fixTimeline().catch(console.error)
