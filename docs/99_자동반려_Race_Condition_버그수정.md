# 자동 반려 Race Condition 버그 수정

날짜: 2026-03-13
이슈: WBC 이슈가 화력 18점인데 자동 반려됨

## 문제 발견

### 사용자 제보
- 이슈: "WBC 점수 조작 죄송"…대만에서 '혐한' 마케팅 펼친 한국 기업
- 현재 화력: 18점
- 최소 기준: 15점
- 상태: 반려 (approval_type: auto)
- **18점 ≥ 15점인데 반려됨** → 버그

### 검증 결과

실제 화력 계산 검증:
- 연결된 뉴스: 17개
- 출처 다양성: 15개
- newsCredibility: 59점
- 커뮤니티: 0개 → communityAmp: 0
- **최종 화력: 59 × 0.3 = 18점** ✅

시간 가중치도 모두 1.0으로 확인됨 (1일 전 뉴스).

## 버그 원인

### Race Condition

트랙A가 이슈를 생성할 때:

1. **04:36:10** - 이슈 레코드 생성 (approval_status: 대기)
2. 17개 뉴스에 `issue_id` 할당 시작
3. **뉴스 연결 완료 전** - 화력 재계산 Cron 실행
4. Cron이 화력 계산 → 뉴스 연결 미완료로 낮은 화력
5. 15점 미만으로 판단 → **자동 반려**
6. 이후 뉴스 연결 완료 → 화력 18점으로 복구
7. **하지만 approval_status는 이미 "반려"**
8. **06:55:31** - 최종 수정 (반려 상태 기록)

### 타임라인 증거

```
생성: 2026-03-13T04:36:10
수정: 2026-03-13T06:55:31
경과: 2시간 19분
Cron: 10분 간격
추정 실행: 13회
```

첫 번째 Cron 실행(04:46경)에서 뉴스 연결 미완료 상태 감지 → 반려 처리.

## 해결 방안

### 코드 수정

**파일**: `app/api/cron/recalculate-heat/route.ts`

**변경 사항**: 이슈 생성 후 10분 이내는 자동 반려 보류

```typescript
if (issue.approval_status === '대기') {
    const category = issue.category as IssueCategory
    
    // 생성 후 10분 이내 이슈는 자동 반려 보류 (뉴스 연결 완료 대기)
    const ageMinutes = (Date.now() - new Date(issue.created_at).getTime()) / 60000
    const isNewIssue = ageMinutes < 10
    
    // 자동 승인: 화력 + 카테고리 모두 체크
    if (shouldAutoApprove(category, heatIndex)) {
        // 자동 승인 처리
    } else if (heatIndex < MIN_HEAT_TO_REGISTER && !isNewIssue) {
        // 자동 반려: 화력 미달 (단, 생성 10분 이내 이슈는 제외)
    }
    // 그 외:
    // - 화력 15-29점: 대기 유지
    // - 생성 10분 이내 + 화력 미달: 유예 기간 (대기 유지)
}
```

### 수정 내용

**Before**:
```typescript
else if (heatIndex < MIN_HEAT_TO_REGISTER) {
    // 자동 반려
}
```

**After**:
```typescript
else if (heatIndex < MIN_HEAT_TO_REGISTER && !isNewIssue) {
    // 자동 반려 (생성 10분 이내 제외)
}
```

### 로직 설명

**자동 반려 조건**:
1. `approval_status === '대기'`
2. `heatIndex < MIN_HEAT_TO_REGISTER` (15점)
3. **`ageMinutes >= 10` (NEW)** ← 10분 유예 기간

**유예 기간 효과**:
- 트랙A가 이슈 생성 + 뉴스 연결 완료 (5-10분 소요)
- 첫 Cron 실행 시 뉴스 연결 완료 대기
- 두 번째 Cron부터 정확한 화력으로 판단

## 테스트

### 예상 동작

**케이스 1: 정상 이슈**
- 04:36 이슈 생성 (뉴스 17개 연결 시작)
- 04:40 Cron 실행 → 생성 4분 → 유예 (대기 유지)
- 04:50 Cron 실행 → 생성 14분 → 화력 18점 → 대기 유지

**케이스 2: 화력 미달 이슈**
- 04:36 이슈 생성 (뉴스 5개만 연결)
- 04:40 Cron 실행 → 생성 4분 → 유예 (대기 유지)
- 04:50 Cron 실행 → 생성 14분 → 화력 10점 → 자동 반려 ✅

**케이스 3: 고화력 이슈**
- 04:36 이슈 생성 (뉴스 30개 + 커뮤니티 1개)
- 04:40 Cron 실행 → 생성 4분 → 유예 (대기 유지)
- 04:50 Cron 실행 → 생성 14분 → 화력 50점 → 자동 승인 ✅

## 영향 범위

### 변경 영향
- 자동 반려 시점이 최대 10분 지연
- Race Condition 버그 해결
- 승인 이슈는 여전히 반려 안 됨 (기존 로직 유지)

### 부작용 없음
- 화력 미달 이슈는 여전히 자동 반려 (10분 후)
- 고화력 이슈는 즉시 또는 유예 후 자동 승인
- 관리자 수동 승인/반려는 영향 없음

## 관련 파일

**수정 파일**:
- `app/api/cron/recalculate-heat/route.ts` (라인 154-195)

**검증 스크립트** (작성됨):
- `scripts/check_wbc_issue_reject_history.ts`
- `scripts/check_wbc_issue_heat_history.ts`
- `scripts/check_wbc_issue_complete_analysis.ts`
- `scripts/check_wbc_issue_news_relevance.ts`
- `scripts/verify_wbc_issue_heat_calculation.ts`
- `scripts/check_wbc_time_weighted_heat.ts`
- `scripts/final_diagnosis_wbc_bug.ts`
- `scripts/final_wbc_issue_report.ts`

## 결론

사용자의 지적이 정확했습니다.

**버그 확인**: 화력 18점 ≥ 15점인데 자동 반려됨
**원인**: 트랙A 이슈 생성 시 Race Condition
**해결**: 10분 유예 기간 추가

이제 이슈 생성 직후 뉴스 연결이 완료될 때까지 기다린 후 정확한 화력으로 판단합니다.
