# API 토큰 사용량 추적 기능

**날짜**: 구현 날짜 미상  
**목적**: Perplexity API 실제 토큰 사용량 추적

이 문서는 Perplexity API의 토큰 사용량 추적 기능을 설명합니다.

---

## 핵심 변경사항

### 1. DB 스키마 확장

**테이블**: `api_usage`

**추가된 컬럼**:
```sql
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;
```

### 2. 백엔드 로직 수정

**수정된 파일**:
- `lib/api-usage-tracker.ts` - 토큰 정보 저장
- `lib/ai/perplexity-filter.ts` - 토큰 정보 추출
- `lib/ai/perplexity-grouping.ts` - 토큰 정보 추출
- `lib/ai/perplexity-group-validator.ts` - 토큰 정보 추출

**변경 내용**:
```typescript
// Perplexity API 응답의 usage 필드 추출
const usage = data.usage
await incrementApiUsage('perplexity', {
    calls: 1,
    successes: 1,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
})
```

### 3. 관리자 대시보드

**수정된 파일**: `app/admin/page.tsx`

**표시 정보**:
- 오늘/월별 호출 횟수
- 오늘/월별 입력/출력/전체 토큰 수
- 실제 사용량 기반 비용 계산

---

## 사용 방법

### 1. DB 마이그레이션

Supabase Dashboard → SQL Editor:

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
2. "API 비용 현황" → "Perplexity AI API" 섹션
3. 토큰 사용량 정보 확인

---

## 주요 개선

1. **더 정확한 비용 계산**: 추정값 → 실제 사용량
2. **상세한 모니터링**: 호출 + 토큰 동시 추적
3. **비용 최적화**: 입력/출력 토큰 패턴 분석 가능
4. **투명한 운영**: 실시간 토큰 사용량 확인

---

## 주의사항

- 기존 데이터의 토큰 정보는 0으로 설정됨
- 마이그레이션 이후부터 실제 토큰 사용량 누적
- Perplexity API 응답의 `usage` 필드 자동 추출

---

**참고**: 현재 프로젝트는 Perplexity AI를 사용하지 않고 있습니다 (품질 문제로 비활성화).
이 기능은 향후 재사용 시를 대비한 기록입니다.
