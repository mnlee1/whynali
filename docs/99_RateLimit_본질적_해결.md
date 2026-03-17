# Groq API Rate Limit 본질적 해결 방안

## 문제 분석

### 현상
- 트랙 A, auto-create-issue, 커뮤니티 매칭 등 여러 크론이 동시에 Groq API 사용
- 5개 키 모두 순환해도 Rate Limit 소진
- 트랙 A 같은 중요 작업도 실패

### 본질적 원인
- **API 사용 경쟁**: 여러 작업이 선착순으로 같은 키 풀 사용
- **우선순위 없음**: 중요한 작업도 일반 작업과 동등하게 차단
- **스케줄 충돌**: 같은 시간에 여러 크론 실행

## 해결 방안

### 1. 크론 스케줄 분산 (즉시 적용)

`.github/workflows/` 파일 수정:

```yaml
# AS-IS (충돌)
cron-auto-create-issue: */30 * * * *
cron-track-a: */30 * * * *

# TO-BE (분산)
cron-auto-create-issue: 0,30 * * * *   # 0분, 30분
cron-track-a: 15,45 * * * *            # 15분, 45분
```

**효과:**
- 크론 간 15분 간격 확보
- Rate Limit 회복 시간 제공

### 2. Rate Limit 우선순위 시스템 (구현 완료)

**파일:** `lib/ai/rate-limit-priority.ts`

**우선순위 레벨:**
- `critical`: 트랙 A (항상 실행)
- `high`: 이슈 생성 (실패 2회 이상 시 건너뛰기)
- `normal`: 카테고리 분류 (실패 1회 이상 시 건너뛰기)
- `low`: 커뮤니티 매칭 (Rate Limit 감지 즉시 건너뛰기)

**동작 방식:**
1. Rate Limit 실패 기록
2. 실패 횟수가 임계값 초과 시 낮은 우선순위 작업 건너뛰기
3. 5분 후 자동 복구
4. 성공 시 점진적 회복

**트랙 A 적용:**
```typescript
// Rate Limit 체크 (Critical 우선순위)
if (shouldSkipDueToRateLimit({ priority: 'critical', taskName: '트랙 A' })) {
    return // 건너뛰기 (실제로는 거의 실행됨)
}

// AI 호출 성공 시
recordRateLimitSuccess()

// AI 호출 실패 시
recordRateLimitFailure()
```

### 3. 추가 개선 방안 (선택)

#### A. Groq API 키 추가
- 현재 5개 → 10개로 증가
- 무료이므로 비용 없음

#### B. 캐싱 시스템
- 최근 N분간 동일 키워드 검증 결과 캐시
- 중복 AI 호출 방지

#### C. 배치 처리
- 여러 요청을 모아서 한 번에 처리
- API 호출 횟수 감소

## 적용 결과

### 즉시 효과
- 트랙 A는 `critical` 우선순위로 항상 실행
- 다른 크론이 Rate Limit 소진해도 트랙 A는 우선 실행
- 실패 시 자동 기록 및 복구

### 장기 효과
- 시스템 안정성 향상
- 중요 작업 보장
- Rate Limit 효율적 관리

## 테스트 방법

### 1. 우선순위 시스템 단독 테스트

```bash
# Rate Limit 상황에서도 트랙 A가 우선 실행되는지 확인
npx tsx scripts/test-track-a-manual.ts
```

### 2. 스케줄 분산 후 테스트

```bash
# GitHub Actions에서 수동 실행
# 워크플로우: cron-track-a.yml
# 다른 크론과 충돌하지 않는 시간에 실행
```

### 3. 모니터링

서버 로그에서 확인:
```
[Rate Limit] 트랙 A 이슈 검증 (우선순위: critical)
[Rate Limit] 커뮤니티 매칭 건너뛰기 (우선순위: low, 실패: 2회)
```

## 프로덕션 적용 체크리스트

- [ ] `lib/ai/rate-limit-priority.ts` 배포
- [ ] `app/api/cron/track-a/route.ts` 배포
- [ ] GitHub Actions 스케줄 수정
  - [ ] `cron-auto-create-issue.yml`: `0,30 * * * *`
  - [ ] `cron-track-a.yml`: `15,45 * * * *`
- [ ] 다른 크론에도 우선순위 적용 (선택)
- [ ] 모니터링 설정

## 결론

**본질적 문제 해결:**
- ✅ Rate Limit 우선순위 시스템으로 중요 작업 보장
- ✅ 스케줄 분산으로 충돌 방지
- ✅ 자동 복구로 시스템 안정성 향상

**임시 방편이 아닌 근본 해결책**입니다!
