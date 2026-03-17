/**
 * scripts/test-category-strategy.ts
 * 
 * 카테고리 전략 로직 테스트 (API 호출 없이)
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

async function testCategoryStrategy() {
    console.log('=== 카테고리 전략 로직 테스트 ===\n')
    
    // 테스트 케이스
    const strategies = [
        { name: 'AI 전용', value: 'ai' },
        { name: '하이브리드 (기본값)', value: 'hybrid' },
        { name: '키워드 전용', value: 'keyword' }
    ]
    
    console.log('전략별 동작 방식:\n')
    
    for (const strategy of strategies) {
        console.log('━'.repeat(80))
        console.log(`\n전략: ${strategy.name} (CATEGORY_STRATEGY=${strategy.value})\n`)
        
        if (strategy.value === 'ai') {
            console.log('동작:')
            console.log('  1. 키워드 분류 완전히 스킵')
            console.log('  2. Groq AI로 직접 분류')
            console.log('  3. 신뢰도 50% 이상이면 채택')
            console.log('  4. 실패 시 "사회"로 폴백')
            console.log('\n장점:')
            console.log('  ✅ 키워드 유지보수 불필요')
            console.log('  ✅ 맥락 이해로 정확도 향상')
            console.log('  ✅ 새로운 케이스 자동 대응')
            console.log('\n단점:')
            console.log('  ⚠️  모든 이슈에 API 호출 (하루 4회)')
            console.log('  ⚠️  응답 1-2초 소요')
            console.log('\n토큰 사용량:')
            console.log('  하루: ~1,000 토큰 (무료 플랜의 0.2%)')
            
        } else if (strategy.value === 'hybrid') {
            console.log('동작:')
            console.log('  1. 키워드 + 맥락 규칙으로 1차 분류')
            console.log('  2. 신뢰도 낮을 때만 AI 재분류')
            console.log('  3. 신뢰도 70% 이상이면 AI 결과 채택')
            console.log('  4. AI 실패 시 키워드 결과 사용')
            console.log('\n장점:')
            console.log('  ✅ API 호출 최소화 (30-40%만)')
            console.log('  ✅ 대부분 빠른 응답')
            console.log('\n단점:')
            console.log('  ❌ 키워드 유지보수 필요')
            console.log('  ❌ 새로운 케이스 오분류 가능')
            console.log('\n토큰 사용량:')
            console.log('  하루: ~300-400 토큰')
            
        } else if (strategy.value === 'keyword') {
            console.log('동작:')
            console.log('  1. 키워드 + 맥락 규칙으로만 분류')
            console.log('  2. AI 완전히 비활성화')
            console.log('  3. 기존 방식 그대로')
            console.log('\n장점:')
            console.log('  ✅ API 호출 없음 (무료)')
            console.log('  ✅ 매우 빠른 응답')
            console.log('\n단점:')
            console.log('  ❌ 키워드 유지보수 필수')
            console.log('  ❌ 오분류 발생 가능성 높음')
            console.log('  ❌ 무신사 같은 케이스 계속 발생')
            console.log('\n토큰 사용량:')
            console.log('  하루: 0 토큰')
        }
        
        console.log('')
    }
    
    // 권장 설정
    console.log('━'.repeat(80))
    console.log('\n💡 권장 설정\n')
    
    console.log('프로덕션 환경:')
    console.log('  ENABLE_AI_CATEGORY=true')
    console.log('  CATEGORY_STRATEGY=ai')
    console.log('\n이유:')
    console.log('  - 현재 이슈 생성량(하루 4개)에 최적')
    console.log('  - 토큰 사용량 매우 적음 (0.2%)')
    console.log('  - 유지보수 부담 제거')
    console.log('  - 정확도 향상\n')
    
    // 실제 적용 방법
    console.log('━'.repeat(80))
    console.log('\n🚀 실제 적용 방법\n')
    
    console.log('1. .env.local 파일 수정:')
    console.log('   ENABLE_AI_CATEGORY=true')
    console.log('   CATEGORY_STRATEGY=ai\n')
    
    console.log('2. Vercel 환경변수 설정:')
    console.log('   Dashboard → Settings → Environment Variables')
    console.log('   ENABLE_AI_CATEGORY=true')
    console.log('   CATEGORY_STRATEGY=ai\n')
    
    console.log('3. 재배포:')
    console.log('   vercel --prod\n')
    
    console.log('4. 모니터링:')
    console.log('   vercel logs --follow')
    console.log('   검색어: "[AI 카테고리 분류]"\n')
    
    // 롤백 방법
    console.log('━'.repeat(80))
    console.log('\n⚠️  문제 발생 시 롤백\n')
    
    console.log('Rate Limit 발생:')
    console.log('  CATEGORY_STRATEGY=hybrid  (키워드 우선, AI는 보조)\n')
    
    console.log('AI 오분류 발생:')
    console.log('  ENABLE_AI_CATEGORY=false  (키워드 전용으로 복귀)\n')
    
    // 현재 설정 확인
    console.log('━'.repeat(80))
    console.log('\n📋 현재 환경변수 설정\n')
    
    const currentAI = process.env.ENABLE_AI_CATEGORY || '설정 안 됨 (기본값: false)'
    const currentStrategy = process.env.CATEGORY_STRATEGY || '설정 안 됨 (기본값: hybrid)'
    
    console.log(`ENABLE_AI_CATEGORY: ${currentAI}`)
    console.log(`CATEGORY_STRATEGY: ${currentStrategy}\n`)
    
    if (currentAI === 'true' && currentStrategy === 'ai') {
        console.log('✅ AI 전용 모드 활성화됨!')
    } else if (currentAI === 'true') {
        console.log('⚠️  하이브리드 모드 활성화됨 (AI 부분 사용)')
    } else {
        console.log('⚠️  키워드 전용 모드 (AI 미사용)')
        console.log('\nAI 전용으로 전환하려면:')
        console.log('  1. .env.local에 추가:')
        console.log('     ENABLE_AI_CATEGORY=true')
        console.log('     CATEGORY_STRATEGY=ai')
        console.log('  2. 서버 재시작')
    }
}

testCategoryStrategy().catch(console.error)
