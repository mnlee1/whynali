# Perplexity API 토큰 사용량 추적 기능

## 완료된 작업

Perplexity AI의 실제 토큰 사용량을 추적하여 관리자 대시보드에서 확인할 수 있도록 구현했습니다.

## 변경 사항

### 1. DB 마이그레이션
- 파일: `supabase/migrations/add_token_usage_to_api_usage.sql`
- `api_usage` 테이블에 3개 컬럼 추가:
  - `input_tokens` (입력 토큰)
  - `output_tokens` (출력 토큰)
  - `total_tokens` (전체 토큰)

### 2. 백엔드 로직
- `lib/api-usage-tracker.ts`: 토큰 정보를 DB에 저장하도록 수정
- `lib/ai/perplexity-filter.ts`: API 응답에서 토큰 정보 추출
- `lib/ai/perplexity-grouping.ts`: API 응답에서 토큰 정보 추출
- `lib/ai/perplexity-group-validator.ts`: API 응답에서 토큰 정보 추출

### 3. 관리자 대시보드
- `app/admin/page.tsx`: Perplexity 섹션에 상세 토큰 사용량 표시
  - 오늘/월별 호출 횟수
  - 오늘/월별 입력/출력/전체 토큰 수
  - 실제 사용량 기반 비용

### 4. 문서
- `MIGRATION_GUIDE.md`: 배포 가이드
- `CHANGELOG_TOKEN_TRACKING.md`: 변경 사항 상세
- `docs/API_TOKEN_TRACKING.md`: 기술 문서
- `scripts/test-token-tracking.ts`: 테스트 스크립트

## 다음 단계

### 1. DB 마이그레이션 실행

Supabase Dashboard에서 다음 SQL 실행:

```sql
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN api_usage.input_tokens IS '입력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.output_tokens IS '출력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.total_tokens IS '전체 토큰 수 (누적)';
```

### 2. 코드 배포

```bash
git add .
git commit -m "feat: Perplexity API 토큰 사용량 추적 기능 추가"
git push
```

### 3. 확인

1. 관리자 대시보드 접속
2. "API 비용 현황" > "Perplexity AI API" 섹션 확인
3. 토큰 사용량 정보가 표시되는지 확인

## 주요 개선 사항

1. **더 정확한 비용 계산**: 추정값 → 실제 사용량 기반
2. **상세한 모니터링**: 호출 횟수 + 토큰 사용량 동시 추적
3. **비용 최적화**: 입력/출력 토큰 패턴 분석 가능
4. **투명한 운영**: 실시간 토큰 사용량 확인

## 주의사항

- 기존 데이터의 토큰 정보는 0으로 설정됨
- 마이그레이션 이후부터 실제 토큰 사용량이 누적됨
- Perplexity API 응답의 `usage` 필드를 자동으로 추출함

## 관련 문서

- 배포 가이드: `MIGRATION_GUIDE.md`
- 상세 변경 사항: `CHANGELOG_TOKEN_TRACKING.md`
- 기술 문서: `docs/API_TOKEN_TRACKING.md`
