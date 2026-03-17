/**
 * scripts/test-ai-category.ts
 * 
 * AI 전용 카테고리 분류 테스트
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

// AI 강제 활성화
process.env.ENABLE_AI_CATEGORY = 'true'
process.env.CATEGORY_STRATEGY = 'ai'

import { classifyCategoryByAI } from '../lib/candidate/category-classifier'

async function testAICategory() {
    console.log('=== AI 전용 카테고리 분류 테스트 ===\n')
    console.log('모드: AI 전용 (키워드 완전 무시)\n')

    const testCases = [
        {
            name: '무신사 이슈 (이전 오분류)',
            titles: ['무신사, 스포츠·IP 전문 큐레이션관 팬 스토어 론칭'],
            expected: '기술'
        },
        {
            name: '스포츠마케팅 (관광)',
            titles: ['2026 나주방문의 해 스포츠마케팅으로 체류형 관광 전환 박차'],
            expected: '사회'
        },
        {
            name: '실제 스포츠 경기',
            titles: ['손흥민 2골 폭발, 토트넘 4-1 대승'],
            expected: '스포츠'
        },
        {
            name: '연예인 부동산',
            titles: ['김태희, 한남더힐 127억에 매각…85억 시세차익'],
            expected: '연예'
        },
        {
            name: '정치 스포츠',
            titles: ['윤석열 대통령, 올림픽 선수단 격려 방문'],
            expected: '정치'
        },
        {
            name: '기술 스타트업',
            titles: ['네이버, AI 검색 서비스 클로바X 공식 출시'],
            expected: '기술'
        },
        {
            name: '사회 사건',
            titles: ['강남역 인근 화재 발생, 10여명 대피'],
            expected: '사회'
        }
    ]

    let successCount = 0
    let failCount = 0

    for (const testCase of testCases) {
        console.log('━'.repeat(80))
        console.log(`\n테스트: ${testCase.name}`)
        console.log(`제목: ${testCase.titles[0]}`)
        console.log(`예상 카테고리: ${testCase.expected}`)
        
        try {
            const result = await classifyCategoryByAI(testCase.titles)
            
            console.log(`\nAI 분류 결과:`)
            console.log(`  카테고리: ${result.category}`)
            console.log(`  신뢰도: ${result.confidence}%`)
            console.log(`  이유: ${result.reason}`)
            
            const isCorrect = result.category === testCase.expected
            
            if (isCorrect) {
                console.log(`\n✅ 성공 (예상과 일치)`)
                successCount++
            } else {
                console.log(`\n⚠️  예상과 다름 (예상: ${testCase.expected}, 실제: ${result.category})`)
                failCount++
            }
            
            // Rate Limit 방지
            await new Promise(resolve => setTimeout(resolve, 2000))
            
        } catch (error: any) {
            console.error(`\n❌ 에러:`, error.message)
            failCount++
            
            if (error.status === 429) {
                console.log('\nRate Limit 도달. 1분 대기 중...')
                await new Promise(resolve => setTimeout(resolve, 60000))
            }
        }
    }

    // 결과 요약
    console.log('\n' + '━'.repeat(80))
    console.log('\n=== 테스트 결과 요약 ===\n')
    console.log(`총 테스트: ${testCases.length}개`)
    console.log(`성공: ${successCount}개 ✅`)
    console.log(`실패: ${failCount}개 ❌`)
    console.log(`정확도: ${((successCount / testCases.length) * 100).toFixed(1)}%`)
    
    if (successCount === testCases.length) {
        console.log('\n🎉 모든 테스트 통과! AI 전용 모드 적용 가능합니다.')
    } else if (successCount >= testCases.length * 0.8) {
        console.log('\n✅ 대부분 테스트 통과. AI 전용 모드 권장합니다.')
    } else {
        console.log('\n⚠️  일부 테스트 실패. 결과를 검토해주세요.')
    }
}

testAICategory().catch(console.error)
