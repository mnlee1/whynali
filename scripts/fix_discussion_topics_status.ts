/**
 * scripts/fix_discussion_topics_status.ts
 * 
 * 이전 코드로 잘못 저장된 토론 주제 데이터 수정
 * - approval_status가 '승인'인 항목을 '진행중'으로 변경
 * - is_ai_generated가 false인데 AI로 생성된 항목을 true로 변경
 * 
 * 실행: npx tsx scripts/fix_discussion_topics_status.ts
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function fixDiscussionTopics() {
    console.log('토론 주제 데이터 수정 시작...\n')

    try {
        // 1. approval_status가 '승인'인 항목 조회
        const { data: approvedTopics, error: approvedError } = await supabaseAdmin
            .from('discussion_topics')
            .select('id, body, approval_status, is_ai_generated, created_at')
            .eq('approval_status', '승인')

        if (approvedError) {
            console.error('승인 상태 조회 오류:', approvedError)
            return
        }

        console.log(`\n[1단계] approval_status = '승인' 항목: ${approvedTopics?.length || 0}개`)
        
        if (approvedTopics && approvedTopics.length > 0) {
            console.log('\n다음 항목들을 "진행중"으로 변경합니다:')
            approvedTopics.forEach((topic, idx) => {
                console.log(`  ${idx + 1}. ${topic.body.substring(0, 50)}...`)
            })

            // '승인' -> '진행중'으로 변경
            const { error: updateError } = await supabaseAdmin
                .from('discussion_topics')
                .update({ 
                    approval_status: '진행중',
                    approved_at: new Date().toISOString()
                })
                .eq('approval_status', '승인')

            if (updateError) {
                console.error('승인 상태 업데이트 오류:', updateError)
            } else {
                console.log(`✅ ${approvedTopics.length}개 항목을 "진행중"으로 변경 완료`)
            }
        }

        // 2. '반려' 상태 항목 조회 (혹시 있다면)
        const { data: rejectedTopics, error: rejectedError } = await supabaseAdmin
            .from('discussion_topics')
            .select('id, body, approval_status')
            .eq('approval_status', '반려')

        if (rejectedError) {
            console.error('반려 상태 조회 오류:', rejectedError)
        } else if (rejectedTopics && rejectedTopics.length > 0) {
            console.log(`\n[2단계] approval_status = '반려' 항목: ${rejectedTopics.length}개`)
            console.log('이 항목들을 "마감"으로 변경합니다:')
            rejectedTopics.forEach((topic, idx) => {
                console.log(`  ${idx + 1}. ${topic.body.substring(0, 50)}...`)
            })

            // '반려' -> '마감'으로 변경
            const { error: updateError } = await supabaseAdmin
                .from('discussion_topics')
                .update({ approval_status: '마감' })
                .eq('approval_status', '반려')

            if (updateError) {
                console.error('반려 상태 업데이트 오류:', updateError)
            } else {
                console.log(`✅ ${rejectedTopics.length}개 항목을 "마감"으로 변경 완료`)
            }
        }

        // 3. 전체 상태 확인
        const { data: allTopics, error: allError } = await supabaseAdmin
            .from('discussion_topics')
            .select('approval_status, is_ai_generated')

        if (allError) {
            console.error('전체 조회 오류:', allError)
        } else {
            console.log('\n\n[최종 상태]')
            const statusCount: Record<string, number> = {}
            const aiCount = { ai: 0, manual: 0 }

            allTopics?.forEach(topic => {
                statusCount[topic.approval_status] = (statusCount[topic.approval_status] || 0) + 1
                if (topic.is_ai_generated) {
                    aiCount.ai++
                } else {
                    aiCount.manual++
                }
            })

            console.log('\n승인 상태별 현황:')
            Object.entries(statusCount).forEach(([status, count]) => {
                console.log(`  ${status}: ${count}개`)
            })

            console.log('\n생성 유형별 현황:')
            console.log(`  AI 생성: ${aiCount.ai}개`)
            console.log(`  직접 생성: ${aiCount.manual}개`)
        }

        console.log('\n✅ 모든 수정 작업 완료')
    } catch (e) {
        console.error('오류 발생:', e)
    }
}

fixDiscussionTopics()
