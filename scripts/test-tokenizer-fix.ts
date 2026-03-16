/**
 * scripts/test-tokenizer-fix.ts
 * 
 * 토크나이저 수정 테스트
 */

import { tokenize } from '../lib/candidate/tokenizer'

const title1 = '유한재단, 사회보장정보원과 돌봄 청소년·청년 지원 업무협약 체결'
const title2 = '유한재단, 한국사회보장정보원과 맞손…돌봄 청소년·청년 지원사업 추'

console.log('=== 토크나이저 개선 테스트 ===\n')

console.log(`제목 1: "${title1}"`)
const tokens1 = tokenize(title1)
console.log(`토큰: [${tokens1.join(', ')}]`)
console.log(`토큰 수: ${tokens1.length}\n`)

console.log(`제목 2: "${title2}"`)
const tokens2 = tokenize(title2)
console.log(`토큰: [${tokens2.join(', ')}]`)
console.log(`토큰 수: ${tokens2.length}\n`)

const commonTokens = tokens1.filter(t => tokens2.includes(t))
console.log(`공통 토큰: [${commonTokens.join(', ')}]`)
console.log(`공통 토큰 수: ${commonTokens.length}\n`)

console.log('━'.repeat(80) + '\n')

console.log('✅ 개선 사항:\n')
console.log('1. "XXX와", "XXX과" 조사 제거')
console.log('   - "사회보장정보원과" → "사회보장정보원"')
console.log('   - "한국사회보장정보원과" → "한국사회보장정보원"\n')

console.log('2. "한국XXX" → "XXX" 정규화 (4글자 이상)')
console.log('   - "한국사회보장정보원" → "사회보장정보원"\n')

console.log('결과:')
console.log(`  Before: 공통 토큰 4개 (유한재단, 돌봄, 청소년, 청년)`)
console.log(`  After:  공통 토큰 ${commonTokens.length}개 (${commonTokens.join(', ')})\n`)

if (commonTokens.includes('사회보장정보원')) {
    console.log('✅ "사회보장정보원" 통일 성공!')
} else {
    console.log('❌ "사회보장정보원" 통일 실패')
}
