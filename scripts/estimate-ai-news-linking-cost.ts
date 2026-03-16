/**
 * scripts/estimate-ai-news-linking-cost.ts
 * 
 * AI 뉴스 연결 도입 시 Groq 토큰 사용량 추정
 */

console.log('=== AI 뉴스 연결 Groq 토큰 사용량 추정 ===\n')

// Groq 무료 플랜 제한
const GROQ_FREE_DAILY_TOKENS = 500_000
const GROQ_FREE_DAILY_REQUESTS = 14_400

console.log('📊 Groq 무료 플랜 제한:\n')
console.log(`  일일 토큰: ${GROQ_FREE_DAILY_TOKENS.toLocaleString()}`)
console.log(`  일일 요청: ${GROQ_FREE_DAILY_REQUESTS.toLocaleString()}\n`)

console.log('━'.repeat(80) + '\n')

// 현재 사용량 (카테고리 분류)
const CURRENT_ISSUES_PER_DAY = 4
const TOKENS_PER_CATEGORY = 250
const CURRENT_DAILY_TOKENS = CURRENT_ISSUES_PER_DAY * TOKENS_PER_CATEGORY

console.log('✅ 현재 사용량 (카테고리 분류):\n')
console.log(`  하루 평균 이슈: ${CURRENT_ISSUES_PER_DAY}개`)
console.log(`  이슈당 토큰: ${TOKENS_PER_CATEGORY}`)
console.log(`  일일 총 토큰: ${CURRENT_DAILY_TOKENS.toLocaleString()}`)
console.log(`  비율: ${((CURRENT_DAILY_TOKENS / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(2)}%\n`)

console.log('━'.repeat(80) + '\n')

// 뉴스 연결 시나리오 1: 개별 검증
console.log('❌ 시나리오 1: 개별 뉴스 AI 검증 (비효율)\n')

const CRON_RUNS_PER_DAY = 48 // 30분마다
const ISSUES_PER_RUN = 50
const NEW_ISSUES_PER_RUN = 10 // 실제로 새 뉴스가 있는 이슈
const NEWS_CANDIDATES_PER_ISSUE = 10 // 키워드 필터 후 후보
const TOKENS_PER_NEWS_CHECK = 250

const scenario1_tokens_per_run = NEW_ISSUES_PER_RUN * NEWS_CANDIDATES_PER_ISSUE * TOKENS_PER_NEWS_CHECK
const scenario1_daily_tokens = CRON_RUNS_PER_DAY * scenario1_tokens_per_run
const scenario1_daily_requests = CRON_RUNS_PER_DAY * NEW_ISSUES_PER_RUN * NEWS_CANDIDATES_PER_ISSUE

console.log(`  Cron 실행: 30분마다 (하루 ${CRON_RUNS_PER_DAY}회)`)
console.log(`  처리 이슈: ${ISSUES_PER_RUN}개 (실제 새 뉴스 ${NEW_ISSUES_PER_RUN}개)`)
console.log(`  이슈당 후보 뉴스: ${NEWS_CANDIDATES_PER_ISSUE}건`)
console.log(`  뉴스당 토큰: ${TOKENS_PER_NEWS_CHECK}`)
console.log(`  실행당 토큰: ${scenario1_tokens_per_run.toLocaleString()}`)
console.log(`  일일 총 토큰: ${scenario1_daily_tokens.toLocaleString()}`)
console.log(`  일일 요청수: ${scenario1_daily_requests.toLocaleString()}`)
console.log(`  토큰 비율: ${((scenario1_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%`)
console.log(`  요청 비율: ${((scenario1_daily_requests / GROQ_FREE_DAILY_REQUESTS) * 100).toFixed(1)}%`)
console.log(`  결과: ❌ 초과 (${(scenario1_daily_tokens / GROQ_FREE_DAILY_TOKENS).toFixed(1)}배)\n`)

console.log('━'.repeat(80) + '\n')

// 시나리오 2: 배치 검증
console.log('✅ 시나리오 2: 배치 검증 (권장)\n')

const BATCH_TOKENS_PER_ISSUE = 500 // 이슈 1개 + 후보 10개를 한 번에
const scenario2_tokens_per_run = NEW_ISSUES_PER_RUN * BATCH_TOKENS_PER_ISSUE
const scenario2_daily_tokens = CRON_RUNS_PER_DAY * scenario2_tokens_per_run
const scenario2_daily_requests = CRON_RUNS_PER_DAY * NEW_ISSUES_PER_RUN

console.log(`  Cron 실행: 30분마다 (하루 ${CRON_RUNS_PER_DAY}회)`)
console.log(`  처리 이슈: ${NEW_ISSUES_PER_RUN}개 (새 뉴스 있는 이슈만)`)
console.log(`  이슈당 배치 토큰: ${BATCH_TOKENS_PER_ISSUE} (후보 10개 포함)`)
console.log(`  실행당 토큰: ${scenario2_tokens_per_run.toLocaleString()}`)
console.log(`  일일 총 토큰: ${scenario2_daily_tokens.toLocaleString()}`)
console.log(`  일일 요청수: ${scenario2_daily_requests.toLocaleString()}`)
console.log(`  토큰 비율: ${((scenario2_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%`)
console.log(`  요청 비율: ${((scenario2_daily_requests / GROQ_FREE_DAILY_REQUESTS) * 100).toFixed(1)}%`)
console.log(`  결과: ${scenario2_daily_tokens <= GROQ_FREE_DAILY_TOKENS ? '✅' : '❌'} ${scenario2_daily_tokens <= GROQ_FREE_DAILY_TOKENS ? '가능' : '초과'}\n`)

console.log('━'.repeat(80) + '\n')

// 시나리오 3: 1시간 주기 + 배치
console.log('✅ 시나리오 3: 1시간 주기 + 배치 (더 안전)\n')

const CRON_RUNS_PER_DAY_HOURLY = 24
const scenario3_tokens_per_run = NEW_ISSUES_PER_RUN * BATCH_TOKENS_PER_ISSUE
const scenario3_daily_tokens = CRON_RUNS_PER_DAY_HOURLY * scenario3_tokens_per_run + CURRENT_DAILY_TOKENS
const scenario3_daily_requests = CRON_RUNS_PER_DAY_HOURLY * NEW_ISSUES_PER_RUN + CURRENT_ISSUES_PER_DAY

console.log(`  Cron 실행: 1시간마다 (하루 ${CRON_RUNS_PER_DAY_HOURLY}회)`)
console.log(`  처리 이슈: ${NEW_ISSUES_PER_RUN}개`)
console.log(`  이슈당 배치 토큰: ${BATCH_TOKENS_PER_ISSUE}`)
console.log(`  실행당 토큰: ${scenario3_tokens_per_run.toLocaleString()}`)
console.log(`  뉴스 연결 토큰: ${(scenario3_daily_tokens - CURRENT_DAILY_TOKENS).toLocaleString()}`)
console.log(`  카테고리 토큰: ${CURRENT_DAILY_TOKENS.toLocaleString()}`)
console.log(`  일일 총 토큰: ${scenario3_daily_tokens.toLocaleString()}`)
console.log(`  일일 요청수: ${scenario3_daily_requests.toLocaleString()}`)
console.log(`  토큰 비율: ${((scenario3_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%`)
console.log(`  요청 비율: ${((scenario3_daily_requests / GROQ_FREE_DAILY_REQUESTS) * 100).toFixed(1)}%`)
console.log(`  결과: ${scenario3_daily_tokens <= GROQ_FREE_DAILY_TOKENS ? '✅' : '❌'} ${scenario3_daily_tokens <= GROQ_FREE_DAILY_TOKENS ? '가능' : '초과'}\n`)

console.log('━'.repeat(80) + '\n')

// 시나리오 4: 하이브리드 (키워드 + AI 선택적)
console.log('✅ 시나리오 4: 하이브리드 (키워드 우선 + AI 보조)\n')

const AI_CHECK_RATIO = 0.3 // 30%만 AI 검증
const scenario4_ai_checks = NEW_ISSUES_PER_RUN * AI_CHECK_RATIO
const scenario4_tokens_per_run = scenario4_ai_checks * BATCH_TOKENS_PER_ISSUE
const scenario4_daily_tokens = CRON_RUNS_PER_DAY * scenario4_tokens_per_run + CURRENT_DAILY_TOKENS

console.log(`  전략: 키워드 신뢰도 낮은 경우만 AI 검증`)
console.log(`  AI 검증 비율: ${(AI_CHECK_RATIO * 100).toFixed(0)}%`)
console.log(`  실행당 AI 검증: ${scenario4_ai_checks.toFixed(1)}개 이슈`)
console.log(`  실행당 토큰: ${scenario4_tokens_per_run.toLocaleString()}`)
console.log(`  뉴스 연결 토큰: ${(scenario4_daily_tokens - CURRENT_DAILY_TOKENS).toLocaleString()}`)
console.log(`  카테고리 토큰: ${CURRENT_DAILY_TOKENS.toLocaleString()}`)
console.log(`  일일 총 토큰: ${scenario4_daily_tokens.toLocaleString()}`)
console.log(`  토큰 비율: ${((scenario4_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%`)
console.log(`  결과: ✅ 가능\n`)

console.log('━'.repeat(80) + '\n')

// 권장 사항
console.log('💡 권장 사항:\n')
console.log('시나리오 4 (하이브리드) 권장\n')
console.log('이유:')
console.log('  1. Groq 무료 플랜 여유 확보 (${((scenario4_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}% 사용)')
console.log('  2. 대부분은 키워드 매칭 (빠름)')
console.log('  3. 애매한 경우만 AI 검증 (정확함)')
console.log('  4. 복합 키워드 패턴으로 키워드 정확도 향상\n')

console.log('구현 방법:')
console.log('  1. 복합 키워드 패턴 추가 (기본)')
console.log('  2. 키워드 임계값 강화 (3개 → 4개)')
console.log('  3. 신뢰도 낮은 경우만 AI 검증')
console.log('     - 공통 키워드 3-4개 (애매함)')
console.log('     - 범용 키워드 포함 (스포츠, 문화 등)')
console.log('  4. 배치로 여러 후보 한 번에 검증\n')

console.log('━'.repeat(80) + '\n')

console.log('📊 최종 토큰 사용량 비교:\n')
console.log(`현재 (카테고리만):           ${CURRENT_DAILY_TOKENS.toLocaleString()} 토큰/일 (${((CURRENT_DAILY_TOKENS / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%)`)
console.log(`시나리오 2 (배치 전체):      ${scenario2_daily_tokens.toLocaleString()} 토큰/일 (${((scenario2_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%)`)
console.log(`시나리오 3 (1시간 주기):     ${scenario3_daily_tokens.toLocaleString()} 토큰/일 (${((scenario3_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%)`)
console.log(`시나리오 4 (하이브리드):     ${scenario4_daily_tokens.toLocaleString()} 토큰/일 (${((scenario4_daily_tokens / GROQ_FREE_DAILY_TOKENS) * 100).toFixed(1)}%)\n`)

console.log('결론: ✅ 하이브리드 방식으로 충분히 가능!')
