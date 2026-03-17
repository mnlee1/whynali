# Claude API 전환 가이드

> 작성일: 2026-03-13
> Groq AI → Claude AI 전환 가이드

## 📋 개요

Groq AI 대신 Anthropic Claude API를 사용하도록 전환합니다.

### Groq vs Claude 비교

| 항목 | Groq | Claude |
|------|------|--------|
| **비용** | 무료 | 유료 ($1.2-13.5/월) |
| **모델** | Llama 3.1 8B | Haiku/Sonnet/Opus |
| **정확도** | 높음 | 매우 높음 ⭐ |
| **속도** | 매우 빠름 | 빠름 |
| **Rate Limit** | 엄격 (TPM 6,000) | 여유 있음 |
| **컨텍스트** | 8K tokens | 200K tokens ⭐ |
| **안정성** | 보통 | 높음 ⭐ |

### Claude 권장 모델

**claude-3-haiku-20240307** (권장)
- 가격: $0.25/M input, $1.25/M output
- 속도: 매우 빠름
- 품질: 높음
- 월 비용: 약 $1.2 (1,600원) - 하루 150K 토큰 기준

**claude-3-5-sonnet-20241022**
- 가격: $3/M input, $15/M output
- 속도: 빠름
- 품질: 매우 높음
- 월 비용: 약 $13.5 (18,000원) - 하루 150K 토큰 기준

---

## 🚀 전환 절차

### 1. Claude API 키 발급 (5분)

**1-1. Anthropic Console 접속**
- URL: https://console.anthropic.com/
- 계정 생성 또는 로그인

**1-2. API Key 생성**
- Dashboard > API Keys 메뉴
- "Create Key" 버튼 클릭
- 키 이름: `whynali-key-1`
- 키 복사 (한 번만 표시됨)

**1-3. 결제 정보 등록**
- Settings > Billing
- 신용카드 등록
- 초기 크레딧: $5 무료 제공 (보통)

**1-4. 추가 키 발급 (선택, 권장)**
- Rate Limit 대비 3-5개 키 발급 권장
- 각 키마다 별도 Rate Limit 적용
- 키 이름: `whynali-key-2`, `whynali-key-3`, ...

---

### 2. 환경변수 설정 (2분)

**2-1. .env.local 업데이트**

```bash
# ===== AI 프로바이더 설정 =====

# 프로바이더 선택: groq 또는 claude
AI_PROVIDER=claude

# Groq API (기존 - 백업용으로 유지)
GROQ_API_KEY=gsk_your_key_1,gsk_your_key_2,gsk_your_key_3,...

# Claude API (신규)
# 여러 개 키를 콤마로 구분 (Rate Limit 대비)
ANTHROPIC_API_KEY=sk-ant-api03-여기에-발급받은-키-1,sk-ant-api03-여기에-발급받은-키-2,sk-ant-api03-여기에-발급받은-키-3

# 또는 CLAUDE_API_KEY로도 사용 가능
# CLAUDE_API_KEY=sk-ant-api03-...

# Claude 모델 선택 (선택 사항, 기본값: haiku)
# CLAUDE_MODEL=claude-3-haiku-20240307  # 빠르고 저렴 (권장)
# CLAUDE_MODEL=claude-3-5-sonnet-20241022  # 더 정확하지만 비쌈
```

**2-2. Vercel 환경변수 설정**

Vercel 대시보드에서:
1. 프로젝트 > Settings > Environment Variables
2. 추가할 변수:
    - `AI_PROVIDER` = `claude`
    - `ANTHROPIC_API_KEY` = `sk-ant-...` (3-5개 키를 콤마로 구분)
3. Save 클릭

---

### 3. 로컬 테스트 (5분)

**3-1. 의존성 설치**

```bash
cd /Users/nhn/Documents/pub/@react/whynali

# Anthropic SDK 설치 (이미 설치됨)
npm install @anthropic-ai/sdk

# 의존성 확인
npm install
```

**3-2. 로컬 실행**

```bash
npm run dev
```

**3-3. 테스트**

브라우저에서 http://localhost:3000 접속

**테스트 항목:**
- [ ] 홈 페이지 로딩
- [ ] 관리자 > 이슈 관리 > AI 카테고리 분류 테스트
- [ ] 콘솔에서 "[ClaudeProvider] 3개 API 키 로드 완료" 메시지 확인
- [ ] 에러 없이 작동

**3-4. 에러 확인**

콘솔에서 확인할 로그:
```
✅ [ClaudeProvider] 3개 API 키 로드 완료
✅ AI 카테고리 분류 완료
```

에러 발생 시:
```
❌ ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다
→ .env.local 파일 확인

❌ 401 Unauthorized
→ API 키가 잘못됨. 키 재확인

❌ 429 Rate Limit
→ 다른 키로 자동 전환됨 (정상)
```

---

### 4. 배포 (2분)

**4-1. Git 커밋**

```bash
git add .
git commit -m "feat: Groq → Claude API 전환

- ClaudeProvider 구현
- 다중 키 순환 및 Rate Limit 처리
- Haiku 모델 사용 (빠르고 저렴)

변경 사항:
- lib/ai/claude-provider.ts 추가
- lib/ai/ai-client.ts 업데이트 (claude 지원)
- @anthropic-ai/sdk 의존성 추가

효과:
- 정확도 향상 (특히 복잡한 추론)
- 안정적인 서비스
- 긴 컨텍스트 지원 (200K tokens)

비용:
- 월 $1.2 (Haiku 기준, 약 1,600원)"

git push origin main
```

**4-2. Vercel 자동 배포**

Vercel이 자동으로 배포합니다. (약 2-3분 소요)

**4-3. 배포 확인**

- Vercel 대시보드 > Deployments
- 최신 배포 상태 "Ready" 확인
- 배포된 URL 접속하여 테스트

---

## 📊 비용 분석

### 현재 사용량 (Groq 기준)

- 하루 평균 토큰: 150,000 tokens
    - 카테고리 분류: 1,000 tokens
    - 중복 체크: 3,000 tokens
    - 뉴스 연결 검증: 121,000 tokens
    - 커뮤니티 매칭: 25,000 tokens

### Claude 비용 계산

**모델별 월 비용:**

| 모델 | Input | Output | 하루 비용 | 월 비용 | 한화 |
|------|-------|--------|-----------|---------|------|
| Haiku (권장) | $0.25/M | $1.25/M | $0.04 | $1.2 | 1,600원 |
| Sonnet 3.5 | $3/M | $15/M | $0.45 | $13.5 | 18,000원 |
| Opus | $15/M | $75/M | $2.25 | $67.5 | 90,000원 |

**권장:** Haiku 모델 사용 (월 1,600원)

### 최적화 후 총 비용

| 항목 | 비용 (월) |
|------|-----------|
| Vercel Pro | $60 (78,000원) |
| Supabase Pro | $42.73 (55,500원) |
| Claude Haiku | $1.2 (1,600원) |
| **총계** | **$103.93 (135,000원)** |

기존 Groq 무료 → Claude 유료로 월 1,600원 추가
하지만 정확도와 안정성 크게 향상

---

## 🔄 Groq로 롤백 방법

Claude 사용 중 문제 발생 시 Groq로 롤백:

**1. 환경변수만 변경**

```bash
# .env.local
AI_PROVIDER=groq  # claude → groq

# Groq 키는 그대로 유지
GROQ_API_KEY=gsk_your_key_1,gsk_your_key_2,...
```

**2. Vercel 환경변수 변경**

- `AI_PROVIDER` = `groq`
- 재배포 (자동)

**3. 즉시 적용**

코드 변경 없이 환경변수만으로 즉시 롤백 가능

---

## 🎯 모니터링

### 1. Claude API 사용량 확인

- Anthropic Console > Usage
- 일일/월간 사용량 확인
- 예상 비용 확인

### 2. Rate Limit 모니터링

Supabase에서 확인:
```sql
SELECT 
    key_hash,
    is_blocked,
    blocked_until,
    fail_count,
    updated_at
FROM ai_key_status
WHERE provider = 'claude'
ORDER BY updated_at DESC;
```

### 3. 알림 설정

**Anthropic Console:**
- Settings > Notifications
- Usage alerts: 80% 사용 시 알림
- Billing alerts: $5 초과 시 알림

---

## ❓ FAQ

**Q: Claude가 Groq보다 좋은 이유?**
- 정확도 높음 (특히 복잡한 추론)
- 안정적인 서비스 (Rate Limit 여유)
- 긴 컨텍스트 (200K vs 8K)

**Q: 비용이 얼마나 증가하나?**
- Haiku 모델: 월 1,600원 추가
- 전체 비용의 1.2% 증가 (무시할 수준)

**Q: Groq는 계속 사용 가능한가?**
- 네, 백업용으로 유지
- 환경변수만 바꾸면 즉시 롤백 가능

**Q: 다른 Claude 모델을 사용하려면?**
```typescript
// lib/ai/claude-provider.ts
const model = options?.model ?? 'claude-3-5-sonnet-20241022'
```
또는 환경변수:
```bash
CLAUDE_MODEL=claude-3-5-sonnet-20241022
```

**Q: 키가 부족하면?**
- Anthropic Console에서 추가 발급
- .env.local에 콤마로 추가
- 자동으로 순환 사용

---

## ✅ 체크리스트

배포 전:
- [ ] Claude API 키 3-5개 발급
- [ ] .env.local 업데이트 (AI_PROVIDER=claude, ANTHROPIC_API_KEY)
- [ ] npm install (Anthropic SDK 설치)
- [ ] 로컬 테스트 (npm run dev)
- [ ] 에러 없이 작동 확인

배포:
- [ ] Vercel 환경변수 설정
- [ ] Git 커밋 & 푸시
- [ ] 배포 확인
- [ ] 운영 환경 테스트

배포 후:
- [ ] Claude Console에서 사용량 확인
- [ ] 알림 설정 (Usage 80%, Billing $5)
- [ ] 1주일 모니터링

---

**작업 완료 예상 시간:** 15분  
**월 비용 증가:** $1.2 (1,600원)  
**효과:** 정확도 향상, 안정성 향상
