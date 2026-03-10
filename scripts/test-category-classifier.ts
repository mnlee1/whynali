/**
 * scripts/test-category-classifier.ts
 * 
 * AI 카테고리 분류 로컬 테스트
 * 
 * 실행:
 * npx tsx scripts/test-category-classifier.ts
 */

import { classifyCategoryByAI } from '../lib/candidate/category-classifier'

async function testCategoryClassifier() {
    console.log('=== AI 카테고리 분류 테스트 ===\n')

    const testCases = [
        {
            name: '케이스 1: 스포츠마케팅 (오분류 예상)',
            titles: [
                "'2026 나주방문의 해' 스포츠마케팅으로 체류형 관광 전환 박차",
                "나주시, 스포츠 마케팅 강화로 관광객 유치",
                "나주 방문의 해 맞아 관광 활성화 기대"
            ],
            expected: '사회'
        },
        {
            name: '케이스 2: 연예인 가짜뉴스 (오분류 예상)',
            titles: [
                "SNS에 퍼진 '쿠엔틴 타란티노 이란 공격 사망설' 진실은?",
                "타란티노 사망설, 가짜뉴스로 밝혀져",
                "할리우드 감독 사망 루머 확산"
            ],
            expected: '사회'
        },
        {
            name: '케이스 3: 정치 (정상 분류 예상)',
            titles: [
                "국회 본회의, 예산안 통과",
                "야당 대표, 정부 비판 성명",
                "대통령실, 외교 일정 발표"
            ],
            expected: '정치'
        },
        {
            name: '케이스 4: 스포츠 (정상 분류 예상)',
            titles: [
                "손흥민, 프리미어리그 2골 폭발",
                "토트넘, 맨체스터 유나이티드 격파",
                "한국 축구 대표팀 평가전 승리"
            ],
            expected: '스포츠'
        }
    ]

    for (const testCase of testCases) {
        console.log(`\n${testCase.name}`)
        console.log(`예상: ${testCase.expected}`)
        console.log(`제목:`)
        testCase.titles.forEach(t => console.log(`  - ${t}`))

        try {
            const result = await classifyCategoryByAI(testCase.titles)
            
            const match = result.category === testCase.expected ? '✅' : '❌'
            console.log(`\n결과: ${match}`)
            console.log(`  카테고리: ${result.category}`)
            console.log(`  신뢰도: ${result.confidence}%`)
            console.log(`  이유: ${result.reason}`)
        } catch (error) {
            console.error('❌ 에러:', error)
        }

        // Rate Limit 방지
        await new Promise(resolve => setTimeout(resolve, 2000))
    }

    console.log('\n=== 테스트 완료 ===')
}

// 실행
testCategoryClassifier().catch(console.error)
