/**
 * scripts/test-duplicate-group-check.ts
 *
 * AI 중복 그룹 체크 시스템 테스트 스크립트
 * 
 * 실행 방법:
 * npx tsx scripts/test-duplicate-group-check.ts
 */

// .env.local 로드
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

interface TestGroup {
    title: string
    category: string
    items: Array<{
        id: string
        title: string
        type: 'news' | 'community'
        category: string | null
        source: string | null
        created_at: string
    }>
}

console.log('========================================')
console.log('AI 중복 그룹 체크 테스트')
console.log('========================================\n')

async function testDuplicateGroupCheck() {
    console.log('1. 환경변수 확인')
    console.log(`   ENABLE_AI_DUPLICATE_GROUP_CHECK: ${process.env.ENABLE_AI_DUPLICATE_GROUP_CHECK}`)
    console.log(`   DUPLICATE_CHECK_AI_CONFIDENCE: ${process.env.DUPLICATE_CHECK_AI_CONFIDENCE || '80 (기본)'}`)
    console.log(`   GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '설정됨 ✅' : '미설정 ❌'}\n`)

    if (!process.env.GROQ_API_KEY) {
        console.error('❌ GROQ_API_KEY가 설정되지 않았습니다.')
        console.error('   .env.local에 GROQ_API_KEY를 추가하세요.\n')
        return
    }

    console.log('2. 테스트 시나리오')
    console.log('   시나리오 1: 같은 인물, 다른 표현')
    console.log('   시나리오 2: 반대 사건')
    console.log('   시나리오 3: 연속 사건\n')

    // 테스트용 더미 그룹 생성
    const testGroups: TestGroup[] = [
        {
            title: '민희진 하이브와 전면전',
            category: '연예',
            items: [
                {
                    id: 'news-1',
                    title: '민희진, 하이브와 전면전',
                    type: 'news',
                    category: '연예',
                    source: '중앙일보',
                    created_at: new Date().toISOString(),
                },
                {
                    id: 'news-2',
                    title: '민희진 대표 하이브 맞서',
                    type: 'news',
                    category: '연예',
                    source: '한겨레',
                    created_at: new Date().toISOString(),
                },
            ],
        },
        {
            title: '민희진 어도어 대표직 사수',
            category: '연예',
            items: [
                {
                    id: 'news-3',
                    title: '민희진 어도어 대표직 사수',
                    type: 'news',
                    category: '연예',
                    source: '조선일보',
                    created_at: new Date().toISOString(),
                },
            ],
        },
        {
            title: '손흥민 골 기록',
            category: '스포츠',
            items: [
                {
                    id: 'news-4',
                    title: '손흥민 골 기록',
                    type: 'news',
                    category: '스포츠',
                    source: 'KBS',
                    created_at: new Date().toISOString(),
                },
            ],
        },
        {
            title: '손흥민 부상 이탈',
            category: '스포츠',
            items: [
                {
                    id: 'news-5',
                    title: '손흥민 부상 이탈',
                    type: 'news',
                    category: '스포츠',
                    source: 'MBC',
                    created_at: new Date().toISOString(),
                },
            ],
        },
    ]

    console.log('3. 테스트 실행')
    console.log('   ⚠️  실제 Groq AI를 호출합니다.\n')

    try {
        const { detectDuplicateGroups } = await import('../lib/candidate/duplicate-checker')

        // 연예 카테고리 테스트
        console.log('   [카테고리: 연예]')
        const entertainmentGroups = testGroups
            .filter(g => g.category === '연예')
            .map((g, idx) => ({
                originalIndex: testGroups.indexOf(g),
                title: g.title,
                category: g.category,
                createdAt: g.items[0]?.created_at || new Date().toISOString(),
            }))

        if (entertainmentGroups.length >= 2) {
            const recommendations = await detectDuplicateGroups(
                entertainmentGroups,
                '연예'
            )

            console.log(`\n   결과: ${recommendations.length}개 병합 추천`)
            if (recommendations.length > 0) {
                for (const rec of recommendations) {
                    console.log(`   ✅ "${rec.secondaryTitle}" → "${rec.primaryTitle}"`)
                    console.log(`      신뢰도: ${rec.confidence}%, 이유: ${rec.reason}`)
                }
            } else {
                console.log('   ⚠️  예상과 다름: "민희진 하이브"와 "민희진 어도어"는 같은 이슈여야 함')
            }
        }

        // 스포츠 카테고리 테스트
        console.log('\n   [카테고리: 스포츠]')
        const sportsGroups = testGroups
            .filter(g => g.category === '스포츠')
            .map((g, idx) => ({
                originalIndex: testGroups.indexOf(g),
                title: g.title,
                category: g.category,
                createdAt: g.items[0]?.created_at || new Date().toISOString(),
            }))

        if (sportsGroups.length >= 2) {
            const recommendations = await detectDuplicateGroups(
                sportsGroups,
                '스포츠'
            )

            console.log(`\n   결과: ${recommendations.length}개 병합 추천`)
            if (recommendations.length === 0) {
                console.log('   ✅ "골 기록"과 "부상 이탈"은 다른 이슈로 정상 분리됨')
            } else {
                for (const rec of recommendations) {
                    console.log(`   ⚠️  "${rec.secondaryTitle}" → "${rec.primaryTitle}"`)
                    console.log(`      신뢰도: ${rec.confidence}%, 이유: ${rec.reason}`)
                    console.log('      예상과 다름: "골 기록"과 "부상"은 다른 이슈여야 함')
                }
            }
        }

        console.log('\n========================================')
        console.log('테스트 완료 ✅')
        console.log('========================================\n')

        console.log('4. 실제 Cron 테스트')
        console.log('   로컬 테스트:')
        console.log('   $ curl -X GET http://localhost:3000/api/cron/auto-create-issue \\')
        console.log('     -H "Authorization: Bearer your_cron_secret"\n')

        console.log('   프로덕션 테스트:')
        console.log('   $ curl -X GET https://whynali.vercel.app/api/cron/auto-create-issue \\')
        console.log('     -H "Authorization: Bearer your_cron_secret"\n')

        console.log('5. 로그 확인 포인트')
        console.log('   - [키워드 그루핑] N건 → M개 그룹')
        console.log('   - [그룹 재검증] 카테고리 "X" 내 N개 그룹 비교')
        console.log('   - [그룹 병합] "제목2" → "제목1" (신뢰도 N%)')
        console.log('   - [AI 재검증 완료] N개 그룹 병합, 최종 M개 그룹\n')

    } catch (error) {
        console.error('❌ 테스트 실패:', error)
        console.error('\n원인:')
        console.error('- GROQ_API_KEY가 유효하지 않음')
        console.error('- lib/candidate/duplicate-checker.ts 파일 문제')
        console.error('- 네트워크 연결 문제\n')
    }
}

// 테스트 실행
testDuplicateGroupCheck().then(() => {
    console.log('스크립트 종료')
    process.exit(0)
}).catch(error => {
    console.error('스크립트 실행 실패:', error)
    process.exit(1)
})
