# API 토큰 사용량 추적 기능 추가

## 개요

Perplexity API의 실제 토큰 사용량을 추적하여 더 정확한 비용 계산을 가능하게 합니다.

## 변경 사항

### 1. DB 마이그레이션

`api_usage` 테이블에 토큰 사용량 컬럼 추가:
- `input_tokens`: 입력 토큰 수 (누적)
- `output_tokens`: 출력 토큰 수 (누적)
- `total_tokens`: 전체 토큰 수 (누적)

마이그레이션 파일: `supabase/migrations/add_token_usage_to_api_usage.sql`

**실행 방법:**
1. Supabase Dashboard 접속
2. SQL Editor로 이동
3. 마이그레이션 파일 내용 복사 & 실행

```sql
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;
```

### 2. API 사용량 추적 라이브러리 업데이트

`lib/api-usage-tracker.ts`:
- `IncrementOptions` 인터페이스에 `inputTokens`, `outputTokens` 추가
- `incrementApiUsage()` 함수에서 토큰 정보 저장
- `calculatePerplexityCost()` 함수를 토큰 기반으로 변경
- `getAllApiCostsSummary()` 응답에 토큰 사용량 정보 추가

### 3. Perplexity API 호출 부분 업데이트

모든 Perplexity API 호출에서 응답의 `usage` 필드를 추출하여 토큰 정보 저장:

- `lib/ai/perplexity-filter.ts`
- `lib/ai/perplexity-grouping.ts`
- `lib/ai/perplexity-group-validator.ts`

**Perplexity API 응답 구조:**
```json
{
    "choices": [...],
    "usage": {
        "prompt_tokens": 500,
        "completion_tokens": 200,
        "total_tokens": 700
    }
}
```

### 4. 관리자 대시보드 UI 업데이트

`app/admin/page.tsx`:
- Perplexity 섹션에 호출 횟수 및 토큰 사용량 표시
- 오늘/월별 입력/출력/전체 토큰 수 표시
- 더 상세한 사용량 정보 제공

## 배포 순서

1. DB 마이그레이션 실행 (Supabase SQL Editor)
2. 코드 배포 (Vercel)
3. 관리자 대시보드에서 토큰 사용량 확인

## 주의사항

- 기존 데이터의 토큰 정보는 0으로 설정됩니다
- 마이그레이션 후부터 실제 토큰 사용량이 추적됩니다
- 비용 계산이 더 정확해집니다 (추정값 → 실제값)
