# API 비용 대시보드

관리자 대시보드에서 실시간 API 사용량 및 예상 비용을 확인할 수 있습니다.

## 추적되는 API

### 1. 네이버 뉴스 API
- 일일 한도: 25,000건
- 비용: 무료 (한도 내)
- 초과 시: 자동 차단
- 표시 정보:
  - 오늘 사용량 / 월 누적 사용량
  - 일일 한도 대비 진행률 바
  - 80% 초과 시 경고 표시

### 2. Perplexity AI API
- 사용 용도:
  - **AI 그루핑** (같은 이슈끼리 자동 묶기) - 30분마다 1회
  - 이슈 후보 AI 검증 (그룹 검증) - 선택적
  - 토론 주제 생성
- 비용 모델:
  - sonar-large 모델 기준
  - $1 per 1M input tokens
  - $1 per 1M output tokens
- 예상 비용:
  - **AI 그루핑**: 월 약 ₩4 (30분마다 100건 배치)
  - 그룹 검증: 요청당 약 $0.0007
  - 토론 주제: 요청당 약 $0.0035

## AI 그루핑 (신규)

### 개요
Perplexity AI를 사용해 수집된 뉴스를 같은 이슈끼리 자동으로 그룹화합니다.
기존 키워드 방식보다 정확하게 같은 사건/인물/논란을 묶어냅니다.

### 비용
- **월 약 ₩4** (30분마다 100건 배치 처리 기준)
- 하루 48회 × 2,200토큰 = 105,600토큰/일
- 한 달 3.2M토큰 × $0.001 = $0.0032 ≈ ₩4.2

### 활성화 방법
`.env.local`에서 설정:
```bash
ENABLE_AI_GROUPING=true  # AI 그루핑 활성화
```

### 폴백 동작
- Perplexity API 실패 시 자동으로 기존 키워드 방식으로 전환
- API 키가 없으면 키워드 방식 사용

## 대시보드 접근

1. 관리자로 로그인
2. `/admin` 메인 대시보드 접속
3. "API 비용 현황" 섹션 확인

## 표시 항목

### 네이버 뉴스 API
- 오늘 사용량
- 월 누적 사용량
- 일일 한도 진행률 바
- 월 비용: $0 (무료)

### Perplexity AI API
- 오늘 예상 비용
- 월 누적 예상 비용

### 전체 합계
- 월 총 비용 (네이버 + Perplexity)

## 비용 최적화 전략

### 현재 적용된 최적화
1. 1단계 사전 필터 (무료)
   - 뉴스: 최근 10분 내, issue_id 미연결 건만
   - 커뮤니티: 조회수 상위 20%만
   - 중복 제목 제외

2. 배치 처리
   - 20건씩 묶어서 한 번에 처리
   - API 호출 횟수 최소화

3. Rate Limit 대응
   - 요청 사이 300ms 대기
   - 실패 시 2회 재시도

4. 임계값 기반 검증
   - 3건 이상 그룹만 AI 검증
   - 5건 미만은 자동 통과

### 비용 절감 권장사항
1. MIN_SCORE 조정 (현재 7)
   - 점수 임계값을 높이면 저장 건수 감소
   - 단, 이슈 누락 위험 증가

2. BATCH_SIZE 조정 (현재 20)
   - 배치 크기를 늘리면 API 호출 횟수 감소
   - 단, 한 번에 많은 토큰 사용

3. COLLECTION_WINDOW_MIN 조정 (현재 10분)
   - 수집 창을 좁히면 대상 건수 감소
   - 단, 이슈 감지 지연 가능

## 환경변수 설정

`.env.local` 파일에서 조정 가능:

```bash
# 필터링 임계값
FILTER_MIN_SCORE=7
FILTER_BATCH_SIZE=20
FILTER_COLLECTION_WINDOW_MIN=10
FILTER_COMMUNITY_TOP_RATIO=0.2

# 이슈 후보 자동 승인
CANDIDATE_AUTO_APPROVE_THRESHOLD=5
CANDIDATE_ALERT_THRESHOLD=3

# AI 그룹 검증 활성화
ENABLE_AI_GROUP_VALIDATION=true
```

## 기술 구현

### API 사용량 추적
- 파일: `lib/api-usage-tracker.ts`
- DB 테이블: `api_usage`
- 추적 항목:
  - call_count: 총 호출 횟수
  - success_count: 성공 횟수
  - fail_count: 실패 횟수
  - date: 날짜별 집계

### 비용 계산
```typescript
// Perplexity 비용 계산
export function calculatePerplexityCost(callCount: number): number {
    const avgInputTokens = 500
    const avgOutputTokens = 200
    const inputCostPer1M = 5
    const outputCostPer1M = 5
    
    const totalInputTokens = callCount * avgInputTokens
    const totalOutputTokens = callCount * avgOutputTokens
    
    const inputCost = (totalInputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (totalOutputTokens / 1_000_000) * outputCostPer1M
    
    return inputCost + outputCost
}
```

### API 호출 시 사용량 자동 추적
모든 Perplexity API 호출 시 자동으로 사용량이 기록됩니다:
- `lib/ai/perplexity-group-validator.ts`
- `lib/ai/perplexity-filter.ts`
- `lib/ai/discussion-generator.ts`

## 문의
API 비용 관련 문의는 관리자에게 연락하세요.
