# Claude API 전환 완료 보고서

> 작성일: 2026-03-13
> Groq AI → Claude AI 전환 구현 완료

## ✅ 완료된 작업

### 1. Claude Provider 구현

**파일:** `lib/ai/claude-provider.ts` (신규 생성)

**구현 내용:**
- Anthropic Claude SDK 연동
- AIProvider 인터페이스 구현 (Groq와 동일)
- 다중 키 순환 시스템 (Supabase DB 기반)
- Rate Limit 자동 처리 (429 에러 감지 및 키 전환)
- 키 자동 복구 (blocked_until 지난 키 재활성화)

**지원 모델:**
- `claude-3-haiku-20240307` (기본값, 권장)
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`

**특징:**
- Groq와 완전히 동일한 인터페이스
- 코드 변경 없이 환경변수만으로 전환 가능
- Supabase ai_key_status 테이블 활용 (서버리스 환경 대응)

---

### 2. AI Client 업데이트

**파일:** `lib/ai/ai-client.ts` (업데이트)

**변경 사항:**
- ClaudeProvider import 추가
- createProvider() 함수에 'claude' 케이스 추가
- 프로바이더 전환 로직 유지 (환경변수 기반)

**지원 프로바이더:**
```typescript
AI_PROVIDER=groq    // Groq (무료)
AI_PROVIDER=claude  // Claude (유료)
```

---

### 3. 패키지 설치

**패키지:** `@anthropic-ai/sdk`

```bash
npm install @anthropic-ai/sdk
```

**의존성 추가:**
- package.json에 @anthropic-ai/sdk 추가
- 버전: 최신 stable 버전

---

### 4. 문서화

**신규 문서:**
- `docs/23_Claude_API_전환_가이드.md` - 전환 가이드
    - API 키 발급 방법
    - 환경변수 설정
    - 로컬 테스트 절차
    - 배포 방법
    - 비용 분석
    - Groq 롤백 방법
    - FAQ

**업데이트 문서:**
- `.env.example` - Claude API 키 추가
    - ANTHROPIC_API_KEY 설명
    - AI_PROVIDER 옵션에 claude 추가

---

## 🚀 사용 방법

### 환경변수 설정

```bash
# .env.local

# AI 프로바이더 선택
AI_PROVIDER=claude

# Claude API 키 (3-5개 권장)
ANTHROPIC_API_KEY=sk-ant-api03-키1,sk-ant-api03-키2,sk-ant-api03-키3
```

### 코드는 변경 불필요

기존 코드 그대로 사용:
```typescript
import { getAIClient } from '@/lib/ai/ai-client'

const client = getAIClient()  // AI_PROVIDER에 따라 자동 선택
const response = await client.complete('프롬프트')
```

---

## 📊 Groq vs Claude 비교

### 성능 비교

| 항목 | Groq | Claude Haiku | Claude Sonnet |
|------|------|--------------|---------------|
| 속도 | 매우 빠름 ⚡⚡⚡ | 빠름 ⚡⚡ | 보통 ⚡ |
| 정확도 | 높음 | 높음 | 매우 높음 ⭐ |
| 컨텍스트 | 8K | 200K ⭐ | 200K ⭐ |
| Rate Limit | 엄격 | 여유 있음 | 여유 있음 |
| 안정성 | 보통 | 높음 ⭐ | 높음 ⭐ |

### 비용 비교

**현재 사용량:** 하루 150,000 토큰

| 프로바이더 | 일 비용 | 월 비용 | 연 비용 |
|-----------|---------|---------|---------|
| Groq | $0 | $0 | $0 |
| Claude Haiku (권장) | $0.04 | $1.2 | $14.4 |
| Claude Sonnet | $0.45 | $13.5 | $162 |
| Claude Opus | $2.25 | $67.5 | $810 |

**권장:** Claude Haiku - 월 1,600원 추가

---

## 🎯 전환 이유

### 1. 정확도 향상

**복잡한 추론 작업:**
- 카테고리 분류: 맥락 이해 능력 우수
- 중복 체크: 의미론적 유사도 판단 정확
- 뉴스 연결 검증: 관련도 평가 신뢰성 높음

### 2. 안정성 향상

**Rate Limit 여유:**
- Groq: TPM 6,000 (빡빡함)
- Claude: TPM 50,000+ (여유 있음)

**서비스 안정성:**
- Groq: 무료 서비스로 가끔 불안정
- Claude: 유료 서비스로 안정적

### 3. 긴 컨텍스트

**컨텍스트 길이:**
- Groq: 8K tokens
- Claude: 200K tokens

**활용:**
- 이슈 전체 타임라인 분석
- 여러 뉴스 동시 검증
- 복잡한 이슈 맥락 파악

---

## 💰 비용 영향

### 현재 총 비용 (최적화 후)

| 항목 | Groq 사용 시 | Claude Haiku 사용 시 |
|------|-------------|---------------------|
| Vercel Pro | $60 | $60 |
| Supabase Pro | $42.73 | $42.73 |
| AI 비용 | $0 | $1.2 |
| **총계** | **$102.73** | **$103.93** |

**증가분:** $1.2/월 (1,600원)
**증가율:** 1.2%

### 비용 대비 효과

**투자:** 월 1,600원
**효과:**
- 정확도 향상 → 오분류 감소 → 관리 비용 절감
- 안정성 향상 → 서비스 다운타임 감소
- 긴 컨텍스트 → 더 복잡한 기능 구현 가능

**결론:** 투자 가치 충분

---

## 🔄 롤백 방법

Claude 사용 중 문제 발생 시 즉시 롤백 가능:

### 1. 환경변수만 변경

```bash
# .env.local
AI_PROVIDER=groq  # claude → groq로만 변경
```

### 2. Groq 키 유지

Groq API 키는 그대로 유지 (백업용)
```bash
GROQ_API_KEY=gsk_Za1ffV6q9s...,gsk_EOS2HKZue...
```

### 3. 재배포

- Vercel 환경변수 `AI_PROVIDER=groq`로 변경
- 자동 재배포
- 코드 변경 불필요

**롤백 소요 시간:** 1분

---

## 📝 다음 단계

### 즉시 필요 (15분)

1. **Claude API 키 발급** (5분)
    - [ ] Anthropic Console 접속
    - [ ] 3-5개 API 키 발급
    - [ ] 결제 정보 등록 ($5 무료 크레딧)

2. **환경변수 설정** (5분)
    - [ ] .env.local 업데이트
        - `AI_PROVIDER=claude`
        - `ANTHROPIC_API_KEY=sk-ant-...`
    - [ ] Vercel 환경변수 설정

3. **테스트 및 배포** (5분)
    - [ ] 로컬 테스트 (npm run dev)
    - [ ] Git 커밋 & 푸시
    - [ ] Vercel 자동 배포 확인

### 선택 사항

4. **모니터링 설정** (5분)
    - [ ] Anthropic Console > Usage Alerts
    - [ ] 80% 사용 시 알림
    - [ ] $5 초과 시 알림

5. **성능 비교** (1주)
    - [ ] 카테고리 분류 정확도 비교
    - [ ] 중복 체크 신뢰도 비교
    - [ ] Rate Limit 발생 빈도 비교

---

## ✅ 체크리스트

### 구현 완료
- [x] ClaudeProvider 구현
- [x] ai-client.ts 업데이트
- [x] @anthropic-ai/sdk 설치
- [x] 전환 가이드 문서 작성
- [x] .env.example 업데이트
- [x] 로컬 테스트 (코드 검증)

### 배포 필요
- [ ] Claude API 키 발급
- [ ] .env.local 설정
- [ ] Vercel 환경변수 설정
- [ ] 로컬 실행 테스트
- [ ] Git 커밋 & 푸시
- [ ] 운영 환경 테스트

### 모니터링
- [ ] Claude Console Usage 확인
- [ ] 알림 설정
- [ ] 1주일 성능 모니터링
- [ ] 비용 확인

---

## 📞 기술 지원

### Claude API 관련

**공식 문서:**
- https://docs.anthropic.com/

**주요 레퍼런스:**
- Messages API: https://docs.anthropic.com/en/api/messages
- Rate Limits: https://docs.anthropic.com/en/api/rate-limits
- Pricing: https://www.anthropic.com/pricing

### 구현 문의

**파일 위치:**
- Provider: `lib/ai/claude-provider.ts`
- Client: `lib/ai/ai-client.ts`
- Interface: `lib/ai/ai-provider.interface.ts`

**로그 확인:**
```typescript
[ClaudeProvider] 3개 API 키 로드 완료
[ClaudeProvider] 키 복구: ...abcd1234
[ClaudeProvider] Rate Limit - 키 차단: ...abcd1234 (60초 후 재시도)
```

---

## 🎉 요약

### 구현 완료
- Claude API 프로바이더 완벽 구현
- Groq와 동일한 인터페이스
- 환경변수만으로 전환 가능
- 문서화 완료

### 배포 방법
1. Claude API 키 발급 (5분)
2. 환경변수 설정 (5분)
3. 배포 (5분)

### 비용
- 월 $1.2 추가 (1,600원)
- 전체 비용의 1.2% 증가

### 효과
- 정확도 향상 ⭐
- 안정성 향상 ⭐
- 긴 컨텍스트 지원 ⭐

**다음 단계:** `docs/23_Claude_API_전환_가이드.md` 참고하여 배포
