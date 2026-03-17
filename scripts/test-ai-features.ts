/**
 * scripts/test-ai-features.ts
 * 
 * 프로젝트 내 Groq AI 기능 테스트
 * 
 * 사용법:
 *   npx tsx scripts/test-ai-features.ts
 */

import { generateVoteOptions } from '@/lib/ai/vote-generator'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'

async function testAIFeatures() {
    const apiKey = process.env.GROQ_API_KEY

    if (!apiKey) {
        console.error('❌ GROQ_API_KEY 환경변수가 설정되지 않았습니다.')
        process.exit(1)
    }

    console.log('🧪 AI 기능 테스트 시작...\n')

    // 테스트용 이슈 데이터
    const testIssue = {
        id: 'test-123',
        title: '아이유 콘서트 티켓팅 논란',
        category: '연예',
        status: '논란중',
        heat_index: 45
    }

    try {
        // 1. 토론 주제 생성 테스트
        console.log('1️⃣ 토론 주제 생성 테스트...')
        const discussions = await generateDiscussionTopics(testIssue, 2)
        console.log('✅ 토론 주제 생성 성공:')
        discussions.forEach((d, i) => {
            console.log(`   ${i + 1}. ${d.body}`)
        })
        console.log()

        // 2. 투표 생성 테스트
        console.log('2️⃣ 투표 생성 테스트...')
        const votes = await generateVoteOptions(testIssue, 2)
        console.log('✅ 투표 생성 성공:')
        votes.forEach((v, i) => {
            console.log(`   ${i + 1}. ${v.title}`)
            v.choices.forEach((c, j) => {
                console.log(`      - ${c}`)
            })
        })
        console.log()

        console.log('🎉 모든 AI 기능 테스트 통과!\n')
    } catch (error) {
        console.error('❌ AI 기능 테스트 실패:\n')
        if (error instanceof Error) {
            console.error(error.message)
        }
        process.exit(1)
    }
}

testAIFeatures()
