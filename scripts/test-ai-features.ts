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

// 실제 문제가 됐던 케이스를 포함한 다양한 이슈 테스트
const testIssues = [
    {
        id: 'test-001',
        title: '이란·이스라엘 휴전 협상 진행 현황',
        category: '세계',
        status: '논란중',
        heat_index: 72,
    },
    {
        id: 'test-002',
        title: '2026시즌 K리그 첫 이달의 선수상 후보 선정',
        category: '스포츠',
        status: '점화',
        heat_index: 38,
    },
    {
        id: 'test-003',
        title: '국내 스타트업 대규모 투자 유치 및 경영권 변동',
        category: '경제',
        status: '점화',
        heat_index: 55,
    },
    {
        id: 'test-004',
        title: '아이유 콘서트 티켓팅 서버 마비 논란',
        category: '연예',
        status: '논란중',
        heat_index: 45,
    },
]

async function runTest() {
    if (!process.env.GROQ_API_KEY) {
        console.error('❌ GROQ_API_KEY 환경변수가 설정되지 않았습니다.')
        process.exit(1)
    }

    console.log('🧪 AI 투표·토론 주제 생성 테스트\n')
    console.log('='.repeat(60))

    for (const issue of testIssues) {
        console.log(`\n📌 이슈: ${issue.title}`)
        console.log(`   카테고리: ${issue.category} | 상태: ${issue.status} | 화력: ${issue.heat_index}`)
        console.log('-'.repeat(60))

        try {
            // 투표 생성
            console.log('\n[투표]')
            const votes = await generateVoteOptions(issue, 2)
            if (votes.length === 0) {
                console.log('  ⚠️  생성 결과 없음 (길이 초과로 필터링됐거나 생성 실패)')
            }
            votes.forEach((v, i) => {
                const titleLen = v.title.length
                const titleOk = titleLen <= 40 ? '✅' : '❌'
                console.log(`  ${i + 1}. ${titleOk} "${v.title}" (${titleLen}자)`)
                v.choices.forEach((c) => {
                    const choiceLen = c.length
                    const choiceOk = choiceLen <= 20 ? '✅' : '❌'
                    console.log(`     ${choiceOk} "${c}" (${choiceLen}자)`)
                })
            })

            // 토론 주제 생성
            console.log('\n[토론 주제]')
            const topics = await generateDiscussionTopics(issue, 3)
            if (topics.length === 0) {
                console.log('  ⚠️  생성 결과 없음 (길이 초과로 필터링됐거나 생성 실패)')
            }
            topics.forEach((t, i) => {
                const len = t.content.length
                const ok = len <= 60 ? '✅' : '❌'
                console.log(`  ${i + 1}. ${ok} "${t.content}" (${len}자)`)
            })

        } catch (err) {
            console.error(`  ❌ 오류: ${err instanceof Error ? err.message : err}`)
        }

        // rate limit 방지 (Groq 무료 TPM 6000 한도)
        await new Promise((r) => setTimeout(r, 8000))
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 테스트 완료')
}

runTest()
