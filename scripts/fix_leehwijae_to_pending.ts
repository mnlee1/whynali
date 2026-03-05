/**
 * scripts/fix_leehwijae_to_pending.ts
 * 
 * 이휘재 이슈의 토론 주제를 대기 상태로 변경
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function fixToPending() {
    console.log('이휘재 관련 토론 주제 상태 변경 중...\n')

    const targetIds = [
        '185e6417-dded-45e0-8036-a9b05a64f787',
        '54e0d6a5-7662-402d-be0a-4f304959be0e',
        '2c944bae-f4b2-484b-94b0-0c8b933ac045'
    ]

    // 현재 상태 확인
    const { data: before, error: beforeError } = await supabaseAdmin
        .from('discussion_topics')
        .select('id, body, approval_status, is_ai_generated')
        .in('id', targetIds)

    if (beforeError) {
        console.error('조회 오류:', beforeError)
        return
    }

    console.log('변경 전 상태:\n')
    before?.forEach((topic, idx) => {
        console.log(`  ${idx + 1}. ${topic.body}`)
        console.log(`     상태: ${topic.approval_status}, AI: ${topic.is_ai_generated}`)
    })

    // 대기 상태로 변경
    const { error: updateError } = await supabaseAdmin
        .from('discussion_topics')
        .update({ 
            approval_status: '대기',
            approved_at: null
        })
        .in('id', targetIds)

    if (updateError) {
        console.error('\n업데이트 오류:', updateError)
        return
    }

    console.log('\n✅ 3개 항목을 "대기" 상태로 변경 완료')

    // 변경 후 상태 확인
    const { data: after, error: afterError } = await supabaseAdmin
        .from('discussion_topics')
        .select('id, body, approval_status, is_ai_generated')
        .in('id', targetIds)

    if (!afterError && after) {
        console.log('\n변경 후 상태:\n')
        after.forEach((topic, idx) => {
            console.log(`  ${idx + 1}. ${topic.body}`)
            console.log(`     상태: ${topic.approval_status}, AI: ${topic.is_ai_generated}`)
        })
    }
}

fixToPending()
