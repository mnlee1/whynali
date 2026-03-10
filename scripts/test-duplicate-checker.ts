/**
 * scripts/test-duplicate-checker.ts
 *
 * AI 중복 체크 시스템 테스트 스크립트
 */

import { extractKeywords } from '../lib/candidate/duplicate-checker'

// extractKeywords 함수를 테스트용으로 export하지 않았으므로
// 여기서 다시 구현
function testExtractKeywords(title: string): string[] {
    return title
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .map(w => w.toLowerCase())
}

// 반대어 쌍
const OPPOSITE_WORD_PAIRS = [
    ['복귀', '사퇴', '퇴사', '하차'],
    ['찬성', '반대', '거부'],
    ['승인', '반려', '기각'],
    ['기소', '무혐의', '불기소'],
    ['당선', '낙선'],
    ['체포', '석방'],
    ['합격', '불합격'],
    ['승리', '패배'],
]

function testHasOppositeWords(title1: string, title2: string): boolean {
    const words1 = testExtractKeywords(title1)
    const words2 = testExtractKeywords(title2)
    
    for (const opposites of OPPOSITE_WORD_PAIRS) {
        const has1 = opposites.some(w => words1.includes(w))
        const has2 = opposites.some(w => words2.includes(w))
        
        if (has1 && !has2 || !has1 && has2) {
            return true
        }
        
        const word1 = opposites.find(w => words1.includes(w))
        const word2 = opposites.find(w => words2.includes(w))
        if (word1 && word2 && word1 !== word2) {
            return true
        }
    }
    
    return false
}

function testExtractNumbers(title: string): number[] {
    const matches = title.match(/\d+/g)
    return matches ? matches.map(n => parseInt(n)) : []
}

function testHasSignificantNumberDifference(title1: string, title2: string): boolean {
    const nums1 = testExtractNumbers(title1)
    const nums2 = testExtractNumbers(title2)
    
    if (nums1.length === 0 || nums2.length === 0) return false
    
    for (const n1 of nums1) {
        for (const n2 of nums2) {
            if (Math.abs(n1 - n2) === 1 && n1 < 10 && n2 < 10) {
                return true
            }
        }
    }
    
    return false
}

console.log('========================================')
console.log('AI 중복 체크 시스템 테스트')
console.log('========================================\n')

// 테스트 1: 키워드 추출
console.log('테스트 1: 키워드 추출')
const test1Title = '민희진, 하이브와 전면전... "어도어 대표직 사수"'
const test1Keywords = testExtractKeywords(test1Title)
console.log(`  제목: "${test1Title}"`)
console.log(`  키워드: [${test1Keywords.join(', ')}]`)
console.log(`  기대: 민희진, 하이브, 전면전, 어도어, 대표직, 사수\n`)

// 테스트 2: 반대어 감지
console.log('테스트 2: 반대어 감지')
const testCases = [
    { title1: '민희진 복귀', title2: '민희진 사퇴', expected: true },
    { title1: '이재명 기소', title2: '이재명 무혐의', expected: true },
    { title1: '손흥민 승리', title2: '손흥민 패배', expected: true },
    { title1: '민희진 복귀', title2: '민희진 복귀 논란', expected: false },
]

for (const test of testCases) {
    const result = testHasOppositeWords(test.title1, test.title2)
    const pass = result === test.expected ? '✅' : '❌'
    console.log(`  ${pass} "${test.title1}" vs "${test.title2}"`)
    console.log(`     결과: ${result}, 기대: ${test.expected}`)
}
console.log()

// 테스트 3: 숫자 차이 감지
console.log('테스트 3: 숫자 차이 감지 (연속 사건)')
const numberTests = [
    { title1: '민희진 1차 회견', title2: '민희진 2차 회견', expected: true },
    { title1: '이재명 재판 3일차', title2: '이재명 재판 4일차', expected: true },
    { title1: '민희진 100억 투자', title2: '민희진 200억 투자', expected: false },
    { title1: '민희진 회견', title2: '민희진 논란', expected: false },
]

for (const test of numberTests) {
    const result = testHasSignificantNumberDifference(test.title1, test.title2)
    const pass = result === test.expected ? '✅' : '❌'
    console.log(`  ${pass} "${test.title1}" vs "${test.title2}"`)
    console.log(`     결과: ${result}, 기대: ${test.expected}`)
}
console.log()

// 테스트 4: 키워드 공통성
console.log('테스트 4: 키워드 공통성 (AI 체크 대상 필터링)')
const commonTests = [
    { 
        title1: '민희진, 하이브와 전면전', 
        title2: '민희진-하이브 갈등 심화',
        desc: '같은 이슈 (공통 키워드: 민희진, 하이브)'
    },
    { 
        title1: '민희진 기자회견', 
        title2: '손흥민 골 기록',
        desc: '다른 이슈 (공통 키워드 없음)'
    },
    { 
        title1: '민희진, 어도어 대표직 사수', 
        title2: '민희진 인스타그램 게시',
        desc: '관련 이슈 (공통 키워드: 민희진)'
    },
]

for (const test of commonTests) {
    const keywords1 = testExtractKeywords(test.title1)
    const keywords2 = testExtractKeywords(test.title2)
    const common = keywords1.filter(k => keywords2.includes(k))
    const shouldCheck = common.length >= 2
    
    console.log(`  "${test.title1}"`)
    console.log(`  "${test.title2}"`)
    console.log(`     공통 키워드: [${common.join(', ')}] (${common.length}개)`)
    console.log(`     AI 체크 대상: ${shouldCheck ? '✅ YES' : '❌ NO'}`)
    console.log(`     설명: ${test.desc}\n`)
}

console.log('========================================')
console.log('테스트 완료')
console.log('========================================\n')

console.log('💡 참고: AI 정밀 비교는 Groq API가 필요하므로')
console.log('   실제 Cron 실행 시 테스트하세요.')
