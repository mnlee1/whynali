/**
 * scripts/fix_leehwijae_discussions.ts
 * 
 * 이휘재 이슈의 토론 주제를 AI 생성으로 수정
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function fixLeehwijaeDiscussions() {
    console.log('이휘재 관련 토론 주제 수정 중...\n')

    // 이휘재 이슈 ID로 연결된 토론 주제 중 is_ai_generated가 false인 항목들
    const { data: issue, error: issueError } = await supabaseAdmin
        .from('issues')
        .select('id')
        .ilike('title', '%이휘재%')
        .ilike('title', '%불후의 명곡%')
        .single()

    if (issueError || !issue) {
        console.error('이휘재 이슈를 찾을 수 없습니다:', issueError)
        return
    }

    console.log(`이슈 ID: ${issue.id}\n`)

    // 해당 이슈의 토론 주제 조회
    const { data: topics, error: topicsError } = await supabaseAdmin
        .from('discussion_topics')
        .select('id, body, is_ai_generated')
        .eq('issue_id', issue.id)
        .eq('is_ai_generated', false)

    if (topicsError) {
        console.error('토론 주제 조회 오류:', topicsError)
        return
    }

    console.log(`AI 생성으로 표시되지 않은 토론 주제: ${topics?.length || 0}개\n`)

    if (topics && topics.length > 0) {
        topics.forEach((topic, idx) => {
            console.log(`  ${idx + 1}. ${topic.body}`)
        })

        console.log('\n이 항목들을 AI 생성으로 변경합니다...\n')

        // is_ai_generated를 true로 변경
        const { error: updateError } = await supabaseAdmin
            .from('discussion_topics')
            .update({ is_ai_generated: true })
            .eq('issue_id', issue.id)
            .eq('is_ai_generated', false)

        if (updateError) {
            console.error('업데이트 오류:', updateError)
        } else {
            console.log(`✅ ${topics.length}개 항목을 AI 생성으로 변경 완료`)
        }
    } else {
        console.log('수정할 항목이 없습니다.')
    }
}

fixLeehwijaeDiscussions()
