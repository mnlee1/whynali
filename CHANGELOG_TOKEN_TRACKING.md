# Perplexity API 토큰 사용량 추적 기능 추가

## 변경 요약

관리자 대시보드에서 Perplexity API의 실제 토큰 사용량을 확인할 수 있도록 개선했습니다.

## 주요 변경 사항

### 1. 데이터베이스 (Migration)

**파일:** `supabase/migrations/add_token_usage_to_api_usage.sql`

`api_usage` 테이블에 3개 컬럼 추가:
- `input_tokens` (BIGINT): 입력 토큰 수
- `output_tokens` (BIGINT): 출력 토큰 수
- `total_tokens` (BIGINT): 전체 토큰 수

### 2. API 사용량 추적 로직

**파일:** `lib/api-usage-tracker.ts`

#### 변경된 함수들:

1. `IncrementOptions` 인터페이스
   - 추가: `inputTokens?: number`, `outputTokens?: number`

2. `incrementApiUsage()`
   - 토큰 정보를 DB에 저장하도록 수정
   - 예시: `incrementApiUsage('perplexity', { calls: 1, successes: 1, inputTokens: 500, outputTokens: 200 })`

3. `calculatePerplexityCost()`
   - 호출 횟수 기반 → 토큰 기반으로 변경
   - 더 정확한 비용 계산 가능

4. `getAllApiCostsSummary()`
   - 응답에 토큰 사용량 정보 추가:
     ```typescript
     {
         perplexity: {
             calls: { today: number, monthly: number },
             tokens: {
                 today: { input, output, total },
                 monthly: { input, output, total }
             },
             today: number,  // 비용
             monthly: number // 비용
         }
     }
     ```

### 3. Perplexity API 호출 부분

**수정된 파일:**
- `lib/ai/perplexity-filter.ts`
- `lib/ai/perplexity-grouping.ts`
- `lib/ai/perplexity-group-validator.ts`

**변경 내용:**
- Perplexity API 응답에서 `usage` 필드 추출
- `incrementApiUsage()` 호출 시 토큰 정보 전달

```typescript
const data = await response.json()
const usage = data.usage || {}
const inputTokens = usage.prompt_tokens || 0
const outputTokens = usage.completion_tokens || 0

await incrementApiUsage('perplexity', {
    calls: 1,
    successes: 1,
    failures: 0,
    inputTokens,
    outputTokens,
})
```

### 4. 관리자 대시보드 UI

**파일:** `app/admin/page.tsx`

**변경 내용:**
- Perplexity 섹션에 상세 정보 표시:
  - 오늘/월별 호출 횟수
  - 오늘/월별 토큰 사용량 (입력/출력/전체)
  - 비용 정보

**UI 개선:**
- 2열 그리드 레이아웃으로 오늘/월별 정보 분리
- 토큰 사용량을 입력/출력/전체로 구분 표시
- 천 단위 콤마 구분자 적용

## 배포 방법

자세한 배포 가이드는 `MIGRATION_GUIDE.md` 참조

1. Supabase에서 마이그레이션 SQL 실행
2. 코드 배포 (git push → Vercel 자동 배포)
3. 관리자 대시보드에서 확인

## 테스트

```bash
npx tsx scripts/test-token-tracking.ts
```

## 효과

1. **더 정확한 비용 계산**: 추정값 → 실제 사용량 기반
2. **상세한 모니터링**: 호출 횟수 + 토큰 사용량 모두 추적
3. **비용 최적화**: 토큰 사용 패턴 분석 가능

## 관련 파일

### 수정된 파일
- `lib/api-usage-tracker.ts`
- `lib/ai/perplexity-filter.ts`
- `lib/ai/perplexity-grouping.ts`
- `lib/ai/perplexity-group-validator.ts`
- `app/admin/page.tsx`

### 새로 추가된 파일
- `supabase/migrations/add_token_usage_to_api_usage.sql`
- `scripts/test-token-tracking.ts`
- `docs/API_TOKEN_TRACKING.md`
- `MIGRATION_GUIDE.md`
- `CHANGELOG_TOKEN_TRACKING.md` (이 파일)
