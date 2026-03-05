/**
 * scripts/check_specific_discussion.ts
 * 
 * 특정 토론 주제 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function checkDiscussion() {
    console.log('토론 주제 검색 중...\n')

    const { data, error } = await supabaseAdmin
        .from('discussion_topics')
        .select('id, body, approval_status, is_ai_generated, created_at, issues(title)')
        .ilike('issues.title', '%이휘재%')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('조회 오류:', error)
        return
    }

    console.log(`검색 결과: ${data?.length || 0}개\n`)
    
    if (data && data.length > 0) {
        data.forEach((topic, idx) => {
            console.log(`[${idx + 1}] ID: ${topic.id}`)
            console.log(`    이슈: ${topic.issues?.title || '연결 없음'}`)
            console.log(`    내용: ${topic.body}`)
            console.log(`    상태: ${topic.approval_status}`)
            console.log(`    AI 생성: ${topic.is_ai_generated ? 'YES' : 'NO'}`)
            console.log(`    생성일: ${new Date(topic.created_at).toLocaleString('ko-KR')}`)
            console.log('')
        })
    }
}

checkDiscussion()
