# Groq API 키 다중 설정 가이드

날짜: 2026-03-11
업데이트: 2026-03-11 (Supabase 기반 키 순환 시스템)

## 개요

Vercel 서버리스 환경에서 Groq API Rate Limit 문제를 근본적으로 해결하는 시스템입니다.

### 기존 문제

**메모리 기반 키 차단 상태 관리:**
- 각 서버리스 인스턴스가 독립적으로 키 상태 저장
- 모든 인스턴스가 항상 key1부터 시작
- 5개 키를 넣어도 동시에 key1에 요청이 몰림
- 결과: Rate Limit 지속 발생

### 해결 방안

**Supabase 기반 키 차단 상태 공유:**
- `ai_key_status` 테이블에 키 차단 상태 저장
- 모든 서버리스 인스턴스가 실시간으로 차단 상태 공유
- 429 에러 발생 시 해당 키를 DB에 차단 상태로 저장
- 다음 인스턴스는 차단된 키를 건너뛰고 사용 가능한 키 선택

## 설정 방법

### 1. Supabase 테이블 생성

**위치:** `supabase/schema.sql`

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

Supabase 대시보드에서 SQL 실행하여 테이블 생성

### 2. 환경변수 설정

```env
# .env.local
# 여러 키를 콤마로 구분
GROQ_API_KEY=gsk_key1...,gsk_key2...,gsk_key3...

# AI 프로바이더 선택 (기본 groq)
AI_PROVIDER=groq
```

### 3. Vercel 환경변수 등록

Vercel 대시보드 → Settings → Environment Variables:
- `GROQ_API_KEY`: 콤마로 구분된 여러 키
- `AI_PROVIDER`: `groq`

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
├── ai-provider.interface.ts  # 프로바이더 추상화 인터페이스
├── ai-client.ts               # 팩토리 (환경변수 기반 프로바이더 선택)
├── groq-provider.ts           # Groq 구현체 (Supabase 기반 키 관리)
└── groq-client.ts             # 기존 인터페이스 유지 (하위 호환)
```

### 키 순환 흐름

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

## 작동 방식

### 1. 키 차단 상태 저장

```typescript
// 429 에러 발생 시
await supabaseAdmin
    .from('ai_key_status')
    .upsert({
        provider: 'groq',
        key_hash: '...xyz123',  // 키 마지막 8자리
        is_blocked: true,
        blocked_until: '2026-03-11T10:05:00Z',  // 5분 후
        fail_count: 1,
        updated_at: now
    })
```

### 2. 사용 가능한 키 조회

```typescript
// 다음 요청 시
const { data } = await supabaseAdmin
    .from('ai_key_status')
    .select('is_blocked, blocked_until')
    .eq('provider', 'groq')
    .eq('key_hash', keyHash)

// blocked_until이 지났으면 자동 복구
if (data.blocked_until <= now) {
    await supabaseAdmin
        .from('ai_key_status')
        .update({ is_blocked: false })
}
```

### 3. 자동 복구

```
차단된 키 → blocked_until 시간 대기
  ↓
시간 경과 후 자동 복구 (DB에서 is_blocked=false 업데이트)
  ↓
다시 사용 가능
```

## 사용 예시

### 새로운 방식 (권장)

```typescript
import { aiClient } from '@/lib/ai/ai-client'

const response = await aiClient.complete(
    '분석할 텍스트',
    {
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        maxTokens: 500,
        systemPrompt: '당신은 전문가입니다.'
    }
)
```

### 기존 인터페이스 유지 (하위 호환)

```typescript
import { callGroq } from '@/lib/ai/groq-client'

const response = await callGroq(
    [
        { role: 'system', content: '당신은 전문가입니다.' },
        { role: 'user', content: '분석할 텍스트' }
    ],
    {
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 500
    }
)
```

## 모델 변경

### 기존: llama-3.3-70b-versatile
### 신규: llama-3.1-8b-instant

**변경 이유:**
- Rate Limit 여유 5배 확보
- 응답 속도 더 빠름
- 카테고리 분류, 중복 체크 등 간단한 작업에 충분

**적용 위치:**
- `lib/ai/groq-client.ts`: 기본 모델
- `lib/candidate/duplicate-checker.ts`: 중복 체크
- `lib/candidate/community-burst-detector.ts`: 이슈 검증
- `lib/candidate/category-classifier.ts`: 카테고리 분류

## 로그 예시

### 정상 동작

```
[GroqProvider] 5개 API 키 로드 완료
[AI 뉴스 검증] 이슈: "..." - 5건 검증
  ✅ "..." (신뢰도 95%)
  ❌ "..." (다른 주제)
```

### Rate Limit 발생

```
[GroqProvider] Rate Limit - 키 차단: ...xyz123 (300초 후 재시도)
[GroqProvider] 2회 재시도 - 키: ...abc456
[AI 뉴스 검증] 이슈: "..." - 5건 검증 완료
```

### 모든 키 소진

```
[GroqProvider] 모든 키 차단됨. 45초 후 재시도 가능
모든 Groq API 키가 Rate Limit 상태입니다. 잠시 후 다시 시도해주세요.
```

## 토큰 사용량

### 1개 키

```
일일 한도: 500,000 토큰
사용량: 121,000 토큰 (24%)
여유: 379,000 토큰 (76%)
```

### 5개 키

```
일일 한도: 2,500,000 토큰 (500K × 5)
사용량: 121,000 토큰 (5%)
여유: 2,379,000 토큰 (95%)

20배 이상 여유 확보!
```

## Perplexity 전환 대비

### 프로바이더 추가 방법

1. `PerplexityProvider` 구현

```typescript
// lib/ai/perplexity-provider.ts
export class PerplexityProvider implements AIProvider {
    readonly providerName = 'perplexity'
    
    async complete(prompt: string, options?: AIOptions): Promise<string> {
        // Perplexity API 호출
    }
}
```

2. `ai-client.ts`에 추가

```typescript
switch (providerName) {
    case 'groq':
        return new GroqProvider()
    case 'perplexity':
        return new PerplexityProvider()  // 추가
    default:
        throw new Error(`지원하지 않는 AI 프로바이더: ${providerName}`)
}
```

3. 환경변수 변경

```env
AI_PROVIDER=perplexity
PERPLEXITY_API_KEY=your_key
```

기존 코드 수정 불필요 (추상화 레이어가 자동 처리)

## 권장 설정

### 개발/테스트

```env
# 1개 키로 충분
GROQ_API_KEY=gsk_your_key
AI_PROVIDER=groq
```

### 운영 (권장)

```env
# 3-5개 키 설정
GROQ_API_KEY=gsk_key1,gsk_key2,gsk_key3,gsk_key4,gsk_key5
AI_PROVIDER=groq
```

**이유:**
- 서버리스 인스턴스 간 키 분산
- Rate Limit 근본 해결
- 무중단 서비스

## 문제 해결

### 키가 인식 안 됨

```bash
# 환경변수 확인
echo $GROQ_API_KEY

# 콤마 구분 확인
# ❌ GROQ_API_KEY=key1 key2 key3
# ✅ GROQ_API_KEY=key1,key2,key3
```

### Supabase 테이블 없음

```
에러: relation "ai_key_status" does not exist

해결: supabase/schema.sql의 테이블 생성 SQL 실행
```

### 모든 키 차단됨

```
대기: blocked_until 시간만큼 (보통 5분)
또는: 키 추가 등록
또는: 8b 모델로 변경 (Rate Limit 5배 여유)
```

## 결론

✅ **Supabase 기반 키 순환 시스템 구현 완료**

```
기능: ✅ 서버리스 인스턴스 간 키 상태 공유
복구: ✅ 시간 기반 자동 복구
재시도: ✅ 자동 재시도 (최대 3회)
추상화: ✅ AI 프로바이더 추상화 레이어
모델: ✅ 8b 모델 (5배 Rate Limit 여유)
전환 대비: ✅ Perplexity 전환 대비 완료
```

**키 3-5개 등록으로 Rate Limit 근본 해결!**
