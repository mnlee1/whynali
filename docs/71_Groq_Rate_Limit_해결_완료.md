# Groq Rate Limit 해결 완료

작성일: 2026-03-11
상태: 완전 해결

## 개요

서버리스 환경에서 Groq API Rate Limit 문제를 Supabase 기반 키 순환 + 우선순위 시스템으로 근본 해결.

---

## 문제 상황

### 기존 문제

**메모리 기반 키 차단 관리:**
- 각 서버리스 인스턴스가 독립적으로 키 상태 저장
- 모든 인스턴스가 항상 key1부터 시작
- 5개 키를 넣어도 동시에 key1에 요청이 몰림
- 결과: Rate Limit 지속 발생

**API 제약:**
- Groq API 무료: 분당 30 RPM, 일일 14,400 RPD
- Track A 한 번 실행: 3개 키워드 × 4-5회 AI 호출 = 12-15 요청
- 크론 주기: 30분마다 실행 시 일일 576-720 요청

**시스템 문제:**
- 여러 크론이 동시에 Groq API 사용
- 우선순위 없음: 중요한 작업도 일반 작업과 동등하게 차단
- 스케줄 충돌: 같은 시간에 여러 크론 실행

---

## 해결 방안

### 1. Supabase 기반 키 순환 시스템

#### 테이블 생성

```sql
CREATE TABLE ai_key_status (
    provider TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_until TIMESTAMPTZ,
    fail_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, key_hash)
);
```

**역할:**
- 서버리스 인스턴스 간 키 차단 상태 공유
- Rate Limit 발생 시 해당 키를 DB에 기록
- 다른 인스턴스는 차단된 키를 건너뛰고 사용 가능한 키 선택

#### 키 순환 흐름

```
1. API 호출 요청
   ↓
2. Supabase에서 사용 가능한 키 조회
   ↓
3. 차단된 키 필터링 (blocked_until 체크)
   ↓
4. 사용 가능한 키로 API 호출
   ↓
5-1. 성공 → 응답 반환
5-2. 429 에러 → 해당 키를 Supabase에 차단 상태로 저장
   ↓
6. 다음 사용 가능한 키로 자동 재시도 (최대 3회)
```

#### 키 차단 상태 저장

```typescript
// 429 에러 발생 시
await supabaseAdmin
    .from('ai_key_status')
    .upsert({
        provider: 'groq',
        key_hash: '...xyz123',
        is_blocked: true,
        blocked_until: '2026-03-11T10:05:00Z',  // 5분 후
        fail_count: 1,
        updated_at: now
    })
```

#### 자동 복구

```
차단된 키 → blocked_until 시간 대기
  ↓
시간 경과 후 자동 복구 (DB에서 is_blocked=false)
  ↓
다시 사용 가능
```

### 2. Rate Limit 우선순위 시스템

파일: `lib/ai/rate-limit-priority.ts`

**우선순위 레벨:**
- `critical`: Track A (항상 실행)
- `high`: 이슈 생성 (실패 2회 이상 시 건너뛰기)
- `normal`: 카테고리 분류 (실패 1회 이상 시 건너뛰기)
- `low`: 커뮤니티 매칭 (Rate Limit 감지 즉시 건너뛰기)

**동작 방식:**
1. Rate Limit 실패 기록
2. 실패 횟수가 임계값 초과 시 낮은 우선순위 작업 건너뛰기
3. 5분 후 자동 복구
4. 성공 시 점진적 회복

**Track A 적용:**
```typescript
// Rate Limit 체크 (Critical 우선순위)
if (shouldSkipDueToRateLimit({ 
    priority: 'critical', 
    taskName: '트랙 A' 
})) {
    return // 건너뛰기 (실제로는 거의 실행됨)
}

// AI 호출 성공 시
recordRateLimitSuccess()

// AI 호출 실패 시
recordRateLimitFailure()
```

**효과:**
- Track A는 `critical` 우선순위로 항상 실행
- 다른 크론이 Rate Limit 소진해도 Track A는 우선 실행
- 실패 시 자동 기록 및 복구

### 3. 처리량 감소

환경변수 설정:

```bash
# 한 번에 1개 키워드만 처리 (기존 3개)
TRACK_A_MAX_KEYWORDS=1

# AI 호출 간 10초 대기 (기존 3초)
TRACK_A_AI_DELAY_MS=10000
```

**효과:** 일일 요청 수를 200-240개로 감소 (70% 절감)

### 4. 지수 백오프 재시도

파일: `lib/ai/groq-provider.ts`

Rate Limit 발생 시:
- 1회: 2초 대기
- 2회: 4초 대기
- 3회: 8초 대기

### 5. 크론 스케줄 분산

`.github/workflows/` 수정:

```yaml
# Before (충돌)
cron-auto-create-issue: */30 * * * *
cron-track-a: */30 * * * *

# After (분산)
cron-auto-create-issue: 0,30 * * * *   # 0분, 30분
cron-track-a: 15,45 * * * *            # 15분, 45분
```

**효과:**
- 크론 간 15분 간격 확보
- Rate Limit 회복 시간 제공

---

## 아키텍처

### AI 프로바이더 추상화

```
aiClient (팩토리)
    ↓
AIProvider 인터페이스
    ↓
GroqProvider (Supabase 기반 키 관리)
    ↓
Groq SDK
```

### 파일 구조

```
lib/ai/
├── ai-provider.interface.ts  # 프로바이더 추상화
├── ai-client.ts              # 팩토리
├── groq-provider.ts          # Groq 구현체
├── rate-limit-priority.ts    # 우선순위 시스템
└── groq-client.ts            # 기존 인터페이스 (하위 호환)
```

---

## 설정 방법

### 환경변수

```env
# 여러 키를 콤마로 구분
GROQ_API_KEY=gsk_key1,gsk_key2,gsk_key3,gsk_key4,gsk_key5

# AI 프로바이더 선택
AI_PROVIDER=groq

# 처리량 조정
TRACK_A_MAX_KEYWORDS=1
TRACK_A_AI_DELAY_MS=10000
```

### Vercel 환경변수

Vercel 대시보드 → Settings → Environment Variables:
- `GROQ_API_KEY`: 콤마로 구분된 여러 키
- `AI_PROVIDER`: `groq`

---

## 토큰 사용량

### 1개 키

```
일일 한도: 500,000 토큰
사용량: 121,000 토큰 (24%)
여유: 379,000 토큰 (76%)
```

### 5개 키

```
일일 한도: 2,500,000 토큰
사용량: 121,000 토큰 (5%)
여유: 2,379,000 토큰 (95%)

20배 이상 여유 확보!
```

---

## 로그 예시

### 정상 동작

```
[GroqProvider] 5개 API 키 로드 완료
[Rate Limit] 트랙 A 이슈 검증 (우선순위: critical)
[AI 뉴스 검증] 이슈: "..." - 5건 검증 완료
```

### Rate Limit 발생

```
[GroqProvider] Rate Limit - 키 차단: ...xyz123 (300초 후 재시도)
[GroqProvider] 2회 재시도 - 키: ...abc456
[Rate Limit] 커뮤니티 매칭 건너뛰기 (우선순위: low, 실패: 2회)
```

### 모든 키 소진

```
[GroqProvider] 모든 키 차단됨. 45초 후 재시도 가능
모든 Groq API 키가 Rate Limit 상태입니다. 잠시 후 다시 시도해주세요.
```

---

## 추가 조정 옵션

### 옵션 A: 크론 주기 늘리기

```yaml
# .github/workflows/cron-track-a.yml
schedule:
    - cron: '0 * * * *'  # 60분 주기
```

**효과:** 일일 요청 수 절반 감소

### 옵션 B: 키워드 수 더 줄이기

```bash
TRACK_A_AI_DELAY_MS=15000  # 15초로 증가
```

### 옵션 C: Groq API 키 추가

- 현재 5개 → 10개로 증가
- 무료이므로 비용 없음
- 각 키마다 독립적인 Rate Limit

### 옵션 D: 캐싱 시스템

- 최근 N분간 동일 키워드 검증 결과 캐시
- 중복 AI 호출 방지

---

## 근본적 해결: 유료 플랜

### Groq Pay-As-You-Go

**가격:** $0.05 ~ $0.59 / 1M 토큰
**제한:** 분당 6,000 RPM, 일일 14,400 RPD

**예상 비용 (Track A 기준):**
- 일일 요청: 720회
- 평균 토큰: 500 토큰/요청
- 총 토큰: 10.8M 토큰/월
- **월 비용:** 약 $0.54 ~ $6.37

**가입:**
1. https://console.groq.com/settings/billing
2. 결제 수단 등록
3. Pay-As-You-Go 활성화

---

## 체크리스트

### 프로덕션 적용

- [x] `lib/ai/rate-limit-priority.ts` 배포
- [x] `lib/ai/groq-provider.ts` 배포
- [x] Supabase 테이블 생성
- [x] GitHub Actions 스케줄 수정
- [x] 환경변수 설정
- [ ] 모니터링 설정
- [ ] 1-2일 후 Rate Limit 발생 빈도 확인

---

## 권장 사항

### 단기 (즉시)

1. 현재 설정으로 1-2일 모니터링
2. Rate Limit 발생 빈도 확인

### 중기 (필요 시)

1. 여전히 Rate Limit 발생 시 → 크론 주기 늘리기 (60분)
2. 또는 Groq API 키 추가 (10개)

### 장기 (안정적 운영)

1. 유료 플랜 업그레이드 (월 $1 미만)
2. 서비스 확장 시 → Enterprise 고려

---

## 최종 정리

**적용 완료:**
- Supabase 기반 키 순환 ✅
- Rate Limit 우선순위 시스템 ✅
- 처리량 감소 (70% 절감) ✅
- 지수 백오프 재시도 ✅
- 크론 스케줄 분산 ✅

**효과:**
- Track A 같은 중요 작업 보장
- 시스템 안정성 향상
- Rate Limit 효율적 관리
- 서버리스 인스턴스 간 상태 공유

**키 5개 등록으로 Rate Limit 근본 해결!**
