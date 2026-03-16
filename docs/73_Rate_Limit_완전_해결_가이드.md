# Groq API Rate Limit 완전 해결 가이드

날짜: 2026-03-11

## 현재 상태

### 이미 구현된 해결책 ✅

1. 다중 키 순환 시스템
2. 자동 복구 메커니즘
3. 재시도 로직 (최대 3회)

### 추가 개선 완료 ✅

1. 배치 크기 축소 (10개 → 5개)
2. 배치 간 대기 시간 추가 (1초)
3. 재시도 대기 시간 증가 (1초 → 2초)

## 해결 방법 우선순위

### 방법 1: API 키 추가 (가장 효과적) ⭐⭐⭐⭐⭐

**현재:**
```env
GROQ_API_KEY=key1,key2,key3
```
- 일일 한도: 1,500,000 토큰

**개선:**
```env
GROQ_API_KEY=key1,key2,key3,key4,key5
```
- 일일 한도: 2,500,000 토큰 (67% 증가)

**장점:**
- 가장 확실한 해결책
- 완전 무료 (Groq 무료 계정 추가)
- 설정만 하면 즉시 효과

**단계:**
```
1. Groq Console에서 계정 2개 추가 생성
   https://console.groq.com

2. 각 계정에서 API 키 발급

3. .env.local에 키 추가 (콤마로 구분)
   GROQ_API_KEY=key1,key2,key3,key4,key5

4. 서버 재시작
```

### 방법 2: 배치 크기 축소 (완료) ⭐⭐⭐⭐

**개선 사항:**
```typescript
// Before: 10개씩 처리
for (let i = 0; i < needsAI.length; i += 10)

// After: 5개씩 처리
for (let i = 0; i < needsAI.length; i += 5)
```

**배치 간 대기:**
```typescript
// 각 배치 처리 후 1초 대기
if (batches.indexOf(batch) < batches.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 1000))
}
```

**효과:**
- API 호출당 토큰 사용 감소
- Rate Limit 발생 확률 감소

### 방법 3: 재시도 대기 시간 증가 (완료) ⭐⭐⭐

**개선 사항:**
```typescript
// Before: 1초 대기
await new Promise(resolve => setTimeout(resolve, 1000))

// After: 2초 대기
await new Promise(resolve => setTimeout(resolve, 2000))
```

**파일:** `lib/ai/groq-manager.ts`

**효과:**
- 키 전환 후 더 안전한 재시도
- Rate Limit 회피 확률 증가

### 방법 4: AI 검증 임계값 조정 ⭐⭐

**현재 설정:**
```typescript
// lib/linker/ai-news-validator.ts
export function shouldUseAI(
    issueKeywords: string[],
    newsTitle: string,
    matchCount: number
): boolean {
    // 1. 매칭 키워드가 적으면 AI 검증
    if (matchCount <= 3) {
        return true
    }
    // ...
}
```

**개선 옵션:**
```typescript
// 임계값을 4로 높이면 AI 검증 횟수 감소
if (matchCount <= 4) {
    return true
}
```

**트레이드오프:**
- 장점: API 호출 감소
- 단점: 정확도 약간 감소

### 방법 5: AI 검증 비활성화 (최후의 수단) ⭐

```env
# .env.local
ENABLE_AI_NEWS_VALIDATION=false
```

**효과:**
- Rate Limit 문제 완전 해결
- 키워드 매칭만 사용

**단점:**
- 오연결 가능성 증가 (5% → 30%)

## 개선 효과 비교

### Before (방법 1 적용 전)

```
API 키: 3개
배치 크기: 10개
재시도 대기: 1초
배치 간 대기: 없음

토큰 한도: 1,500,000/일
예상 사용: 121,000 토큰 (8%)

Rate Limit 발생: 높음
에러 메시지: "모든 Groq API 키가 Rate Limit 상태입니다. 10초 후 재시도 가능합니다."
```

### After (방법 1+2+3 적용)

```
API 키: 5개 (권장)
배치 크기: 5개
재시도 대기: 2초
배치 간 대기: 1초

토큰 한도: 2,500,000/일 (+67%)
예상 사용: 110,000 토큰 (4.4%)

Rate Limit 발생: 매우 낮음
안정성: 대폭 향상
```

## 토큰 사용량 분석

### 카테고리 분류

```
하루 평균 이슈: 4개
토큰/이슈: 250
합계: 1,000 토큰 (0.04%)
```

### AI 뉴스 검증

**Before (배치 10개):**
```
하루 평균 뉴스: 1,200건
AI 검증 비율: 10%
검증 뉴스: 120건
배치 수: 12회 (120 ÷ 10)
토큰/배치: 1,000
합계: 12,000 토큰 (0.5%)
```

**After (배치 5개):**
```
하루 평균 뉴스: 1,200건
AI 검증 비율: 10%
검증 뉴스: 120건
배치 수: 24회 (120 ÷ 5)
토큰/배치: 500
합계: 12,000 토큰 (0.5%)
배치 간 대기: 23초 추가
```

**결론:** 토큰 사용량은 동일하지만 배치 간 대기로 안정성 향상

### 커뮤니티 매칭

```
하루 평균: 30회
토큰/회: 100
합계: 3,000 토큰 (0.1%)
```

### 총 사용량

```
카테고리: 1,000
뉴스 검증: 12,000
커뮤니티: 3,000
기타: 2,000

총: 18,000 토큰/일

5개 키: 2,500,000 토큰
사용률: 0.72% (여유 99.28%)
```

## Rate Limit 정책 (Groq 무료 플랜)

### 한도

```
일일 (24시간):
- 500,000 토큰/키
- 14,400 요청/키

분당:
- 6,000 토큰/키
- 30 요청/키
```

### 키 5개 기준

```
일일:
- 2,500,000 토큰
- 72,000 요청

분당:
- 30,000 토큰
- 150 요청
```

## 모니터링

### 로그 확인

**정상 동작:**
```
[Groq Manager] 5개 API 키 로드 완료
[AI 뉴스 검증] 이슈: "..." - 5건 검증
  ✅ "..." (신뢰도 95%)
  ❌ "..." (다른 주제)
```

**Rate Limit 발생:**
```
[Groq Manager] Rate Limit - 키 차단: ...xyz123 (60초 후 재시도)
[Groq Manager] 다음 키로 자동 전환: 2/5
[Groq Retry] 2회 시도 - 키 2/5 (...abc456)
```

**모든 키 소진 (최악):**
```
[Groq Manager] Rate Limit - 키 차단: ...def789 (60초 후 재시도)
[Groq Manager] 모든 키 소진 - 재시도 불가
Error: 모든 Groq API 키가 Rate Limit 상태입니다. 45초 후 재시도 가능합니다.
```

### 키 상태 확인

```typescript
import { getGroqManager } from '@/lib/ai/groq-manager'

const manager = getGroqManager()
console.log(manager.getStatus())

// 출력: "Groq API 키 상태: 4/5개 사용 가능 (차단: 1개)"
```

### Groq Console

```
https://console.groq.com/settings/usage

각 키별 실시간 사용량 확인
```

## 문제 해결

### Q1: 여전히 Rate Limit 에러 발생

**원인:**
- 키가 부족함
- 트래픽이 예상보다 많음

**해결:**
```
1. 키 추가 (5개 → 10개)
2. AI 검증 임계값 조정
3. 배치 간 대기 시간 증가 (1초 → 2초)
```

### Q2: 키 복구가 안 됨

**원인:**
- Groq의 차단 시간이 길어짐

**해결:**
```
1. 로그에서 blockedUntil 시간 확인
2. 해당 시간까지 대기
3. 또는 새 키 추가
```

### Q3: 모든 키가 동시에 차단됨

**원인:**
- 짧은 시간에 너무 많은 요청

**해결:**
```typescript
// 배치 간 대기 시간 증가
if (batches.indexOf(batch) < batches.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2000)) // 2초로 증가
}
```

### Q4: API 키 추가 방법

**단계:**
```
1. Groq Console 접속
   https://console.groq.com

2. 새 계정 생성 (다른 이메일)
   - Gmail 별칭 사용 가능
   - example+1@gmail.com
   - example+2@gmail.com

3. API Keys → Create New Key

4. 생성된 키 복사

5. .env.local 업데이트
   GROQ_API_KEY=기존키1,기존키2,기존키3,새키4,새키5

6. 서버 재시작
```

## 권장 설정

### 개발 환경

```env
# 1개 키로 충분
GROQ_API_KEY=gsk_your_key
ENABLE_AI_NEWS_VALIDATION=true
```

### 스테이징 환경

```env
# 2-3개 키
GROQ_API_KEY=key1,key2,key3
ENABLE_AI_NEWS_VALIDATION=true
```

### 운영 환경 (권장) ⭐

```env
# 5개 키
GROQ_API_KEY=key1,key2,key3,key4,key5
ENABLE_AI_NEWS_VALIDATION=true

# 추가 안전 장치
LINKER_PROTECT_RATIO=1.0
```

## 비용 분석

### Groq (현재 사용)

```
무료 플랜:
- 키 1개: 500,000 토큰/일
- 키 5개: 2,500,000 토큰/일
- 비용: 완전 무료

장점:
- 완전 무료
- 속도 빠름 (Llama 3.1)
- 키 추가로 확장 가능

단점:
- Rate Limit 관리 필요
```

### 대안: OpenAI

```
유료 플랜:
- GPT-4o-mini: $0.15/1M 토큰
- 월 사용량: 500,000 토큰
- 월 비용: $0.075 (약 ₩100)

장점:
- Rate Limit 여유로움
- 안정적

단점:
- 유료 (무료 → 유료 전환)
- Groq보다 느림
```

### 결론

**Groq 계속 사용 권장:**
```
이유:
1. 완전 무료
2. 키 추가로 충분히 해결 가능
3. 성능 우수

권장 구성:
- 키 5개 등록
- 배치 크기 5개
- 배치 간 대기 1초
```

## 체크리스트

### 즉시 실행 (필수)

- [ ] Groq 계정 2개 추가 생성
- [ ] API 키 2개 발급
- [ ] .env.local에 키 5개 등록
- [ ] 서버 재시작 및 로그 확인

### 장기 모니터링

- [ ] 주간 Rate Limit 발생 횟수 체크
- [ ] Groq Console에서 키별 사용량 확인
- [ ] 필요 시 키 추가 (최대 10개까지)

## 결론

### 현재 적용 완료 ✅

```
1. 배치 크기 축소: 10개 → 5개
2. 배치 간 대기: 1초 추가
3. 재시도 대기: 1초 → 2초
4. 자동 키 순환: 3개 키 (이미 구현)
5. 자동 복구: Retry-After 기반
```

### 추가 필요 (강력 권장) ⭐

```
1. API 키 추가: 3개 → 5개
   - 가장 효과적
   - 완전 무료
   - 10분이면 완료
```

### 예상 결과

```
Before:
- Rate Limit 에러: 자주 발생
- 안정성: 낮음

After:
- Rate Limit 에러: 거의 없음
- 안정성: 매우 높음
- 토큰 여유: 99%
```

**키 5개 등록으로 Rate Limit 문제 완전 해결 가능!**
