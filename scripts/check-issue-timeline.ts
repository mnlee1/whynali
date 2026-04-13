/**
 * scripts/check-issue-timeline.ts
 * 
 * 타임라인 포인트 확인 및 수정
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function checkTimeline() {
    const issueId = '82acb5c8-b0fc-4396-aa3a-3273db8b366b'
    
    console.log('=== 타임라인 확인 ===\n')
    
    // 타임라인 포인트 조회
    const { data: timeline, error } = await supabase
        .from('timeline_points')
        .select('*')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })
    
    if (error) {
        console.error('에러:', error)
        return
    }
    
    if (!timeline || timeline.length === 0) {
        console.log('타임라인 포인트가 없습니다.')
        return
    }
    
    console.log(`총 ${timeline.length}개 타임라인 포인트:\n`)
    
    // 관련성 분석
    const relevant = []
    const irrelevant = []
    
    for (const point of timeline) {
        const title = point.title.toLowerCase()
        const hasWartime = title.includes('이스라엘') || title.includes('하마스') || 
                          title.includes('이재명') || title.includes('대통령') ||
                          title.includes('李')
        const hasExhibition = title.includes('미술') || title.includes('작품') || 
                             title.includes('회고전') || title.includes('작가') ||
                             title.includes('도청') || title.includes('개최') ||
                             title.includes('허스트')
        
        const analysis = {
            ...point,
            hasWartime,
            hasExhibition,
            relevant: hasWartime && !hasExhibition
        }
        
        if (analysis.relevant) {
            relevant.push(analysis)
        } else {
            irrelevant.push(analysis)
        }
    }
    
    console.log('━'.repeat(80))
    console.log(`\n✅ 관련 있는 타임라인: ${relevant.length}개\n`)
    relevant.forEach((point, idx) => {
        console.log(`${idx + 1}. [${point.stage}] ${point.title}`)
        console.log(`   ID: ${point.id}`)
        console.log(`   발생일: ${new Date(point.occurred_at).toLocaleString('ko-KR')}`)
        if (point.source_url) {
            console.log(`   출처: ${point.source_url}`)
        }
        console.log()
    })
    
    console.log('━'.repeat(80))
    console.log(`\n❌ 관련 없는 타임라인: ${irrelevant.length}개\n`)
    
    if (irrelevant.length > 0) {
        const idsToDelete = []
        
        irrelevant.forEach((point, idx) => {
            console.log(`${idx + 1}. [${point.stage}] ${point.title}`)
            console.log(`   ID: ${point.id}`)
            console.log(`   발생일: ${new Date(point.occurred_at).toLocaleString('ko-KR')}`)
            if (point.source_url) {
                console.log(`   출처: ${point.source_url}`)
            }
            console.log(`   이유: ${point.hasExhibition ? '전시(展示) 관련' : '기타 무관'}`)
            console.log()
            
            idsToDelete.push(point.id)
        })
        
        console.log('━'.repeat(80))
        console.log('\n💡 수정 방법:\n')
        console.log('아래 명령어를 실행하면 무관한 타임라인을 삭제합니다:\n')
        console.log('```typescript')
        console.log(`const idsToDelete = ${JSON.stringify(idsToDelete, null, 2)}`)
        console.log('')
        console.log('await supabase')
        console.log('    .from(\'timeline_points\')')
        console.log('    .delete()')
        console.log('    .in(\'id\', idsToDelete)')
        console.log('```')
    } else {
        console.log('✅ 모든 타임라인이 올바르게 연결되어 있습니다.')
    }
}

checkTimeline().catch(console.error)
