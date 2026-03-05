/**
 * MIGRATION_GUIDE.md
 *
 * API 토큰 사용량 추적 기능 배포 가이드
 */

# 배포 가이드

## 1단계: DB 마이그레이션 실행

1. Supabase Dashboard 접속
2. 프로젝트 선택
3. 왼쪽 메뉴에서 "SQL Editor" 클릭
4. "New query" 버튼 클릭
5. 아래 SQL 복사 & 붙여넣기:

```sql
-- API 사용량 테이블에 토큰 사용량 컬럼 추가
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN api_usage.input_tokens IS '입력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.output_tokens IS '출력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.total_tokens IS '전체 토큰 수 (누적)';
```

6. "Run" 버튼 클릭
7. 성공 메시지 확인

## 2단계: 마이그레이션 확인

SQL Editor에서 다음 쿼리 실행:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'api_usage'
ORDER BY ordinal_position;
```

다음 컬럼들이 있어야 합니다:
- input_tokens (bigint, default 0)
- output_tokens (bigint, default 0)
- total_tokens (bigint, default 0)

## 3단계: 코드 배포

```bash
git add .
git commit -m "feat: Perplexity API 토큰 사용량 추적 기능 추가"
git push
```

Vercel에서 자동 배포됩니다.

## 4단계: 동작 확인

1. 관리자 대시보드 접속 (`/admin`)
2. "API 비용 현황" 섹션 확인
3. Perplexity AI API 카드에 다음 정보가 표시되는지 확인:
   - 오늘/월별 호출 횟수
   - 오늘/월별 토큰 사용량 (입력/출력/전체)
   - 비용

## 5단계: 테스트 (선택사항)

로컬에서 테스트:

```bash
npx tsx scripts/test-token-tracking.ts
```

## 롤백

문제가 발생하면 다음 SQL 실행:

```sql
ALTER TABLE api_usage
    DROP COLUMN IF EXISTS input_tokens,
    DROP COLUMN IF EXISTS output_tokens,
    DROP COLUMN IF EXISTS total_tokens;
```

## 참고

- 기존 데이터의 토큰 정보는 0으로 설정됩니다
- 마이그레이션 이후부터 실제 토큰 사용량이 누적됩니다
- Perplexity API 응답의 `usage.prompt_tokens`, `usage.completion_tokens`를 추출합니다
