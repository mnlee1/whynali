# 화력 재계산 Cron 우선순위 개선

날짜: 2026-03-11

## 문제 상황

기존 화력 재계산 Cron 작업이 최근 15개 이슈만 처리하여, 오래된 이슈의 상태 전환이 누락되는 문제 발생.

### 발견된 사례

**이슈 1**: "다시 한 번 세상 놀래킬 것"…어도어, 새 브랜드 필름
- 승인 후 13일(308시간) 경과
- 화력 25점 (30점 미만)
- 상태 전환 조건 충족: 점화 → 종결 (타임아웃)
- 문제: 처리 대상 15개에서 누락되어 "점화" 상태로 13일간 방치

**이슈 2**: 반려된 이슈 198개가 "점화" 상태로 남음
- `approved_at`이 `null`이어서 상태 전환 로직이 `created_at` 기준으로 계산됨
- 막 생성된 것으로 간주되어 상태 전환이 안 됨

## 개선 내용

### 1. 우선순위 기반 이슈 조회

#### Before

```typescript
const { data: issues } = await supabaseAdmin
    .from('issues')
    .select('id, title, approval_status, status, approved_at, created_at')
    .in('approval_status', ['승인', '대기', '반려'])
    .order('updated_at', { ascending: false })
    .limit(15)
```

문제점:
- 최근 업데이트된 15개만 처리
- 오래 방치된 점화/논란중 이슈 누락
- 상태 전환이 시급한 이슈를 우선 처리하지 못함

#### After

```typescript
// 우선순위 기반 이슈 조회
const [igniteIssues, debateIssues, recentIssues] = await Promise.all([
    // 1) 점화 상태 이슈 (최대 30개) - 반려 이슈 우선, 오래된 순서
    supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, approved_at, created_at, updated_at')
        .eq('status', '점화')
        .in('approval_status', ['승인', '대기', '반려'])
        .order('approval_status', { ascending: false }) // 반려 우선
        .order('approved_at', { ascending: true, nullsFirst: false })
        .limit(30),
    
    // 2) 논란중 상태 이슈 (최대 15개) - 오래 업데이트 안 된 순서
    supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, approved_at, created_at, updated_at')
        .eq('status', '논란중')
        .in('approval_status', ['승인', '대기', '반려'])
        .order('updated_at', { ascending: true })
        .limit(15),
    
    // 3) 최근 업데이트된 이슈 (최대 15개, 점화/논란중 제외)
    supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, approved_at, created_at, updated_at')
        .in('approval_status', ['승인', '대기', '반려'])
        .not('status', 'in', '(점화,논란중)')
        .order('updated_at', { ascending: false })
        .limit(15),
])

// 중복 제거하며 병합 (점화 > 논란중 > 최근 순서)
const issueMap = new Map<string, any>()

;[...(igniteIssues.data ?? []), ...(debateIssues.data ?? []), ...(recentIssues.data ?? [])]
    .forEach(issue => {
        if (!issueMap.has(issue.id)) {
            issueMap.set(issue.id, issue)
        }
    })

const issues = Array.from(issueMap.values())
```

개선점:
- **3단계 우선순위** 적용
  1. 점화 상태 (최대 30개, 반려 우선) - 가장 오래된 것부터 처리
  2. 논란중 상태 (최대 15개) - 오래 업데이트 안 된 것부터
  3. 최근 이슈 (최대 15개) - 종결 등 기타 상태
- 최대 60개까지 처리 가능 (15개 → 60개)
- 중복 제거로 효율성 유지
- 상태 전환이 시급한 이슈를 우선 처리

### 2. 반려 이슈 `approved_at` 수정

#### 문제

```typescript
// 대기 → 반려 시
.update({ 
    approval_status: '반려',
    approval_type: 'auto',
    approval_heat_index: heatIndex
    // approved_at이 설정되지 않음 ❌
})
```

반려된 이슈는 `approved_at`이 `null`이어서:
- 상태 전환 로직이 `created_at` 기준으로 계산됨
- 막 생성된 것으로 간주되어 상태 전환 안 됨
- 결과: 반려된 이슈 198개가 "점화" 상태로 방치

#### 해결

```typescript
// 대기 → 반려 시 approved_at 설정
.update({ 
    approval_status: '반려',
    approval_type: 'auto',
    approval_heat_index: heatIndex,
    approved_at: new Date().toISOString() // ✅ 추가
})
```

추가 조치:
- 기존 `approved_at`이 `null`인 반려 이슈 198개 일괄 수정
- `approved_at = created_at`으로 설정하여 상태 전환 로직 정상 작동

## 테스트 결과

실행 시점: 2026-03-11 00:47

### 1차 실행 (우선순위 개선)

```
처리된 이슈: 35개
전체 이슈: 35개

우선순위별 조회:
- 점화 상태: 20개
- 논란중 상태: 0개
- 최근 이슈: 15개

자동 전환:
- 자동 승인: 0개
- 자동 반려: 0개
- 상태 전환: 21개

평균 화력: 7.14점
실행 시간: 1347ms
```

주요 처리 이슈:
1. 민희진 256억원 포기 제안 - 점화 → 종결 (307.4h 경과, 화력 20점)
2. 갤럭시 버즈4 - 점화 → 종결 (302.7h 경과, 화력 1점)
3. 현대차그룹 새만금 투자 - 점화 → 종결 (283.6h 경과, 화력 17점)
4. **어도어 브랜드 필름** - 점화 → 종결 (308h 경과, 화력 25점) ✅

### 2차 실행 (approved_at 수정 후)

```
반려 이슈 approved_at 수정: 198개
├─ approved_at = created_at으로 설정
└─ 상태 전환 로직 정상 작동 가능

Cron 재실행 3회:
├─ 1회차: 46개 처리, 30개 상태 전환
├─ 2회차: 46개 처리, 27개 상태 전환
├─ 3회차: 36개 처리, 7개 상태 전환
└─ 4회차: 29개 처리, 0개 상태 전환

최종 결과: 반려 + 점화 이슈 70개 → 8개로 감소
```

남은 8개 이슈:
- 경과 시간 6시간 미만 (상태 전환 기준 미충족)
- 또는 화력 10점 이상 + 24시간 미만 (타임아웃 미충족)
- 시간 경과 후 자동 처리 예정

## 영향

### 긍정적 효과

1. **오래된 이슈 자동 정리**: 총 85개 이슈가 정상 상태로 전환됨
   - 어도어 이슈 등 13일간 방치된 이슈 처리
   - 반려된 이슈 62개 정상 상태 전환

2. **처리량 4배 증가**: 15개 → 60개 (점화 30 + 논란중 15 + 최근 15)

3. **우선순위 명확화**: 
   - 반려 이슈 우선 처리 (approved_at 기준)
   - 상태 전환이 시급한 이슈부터 처리

4. **성능 유지**: 여전히 1.3초로 빠름

5. **데이터 무결성 개선**:
   - 반려 이슈도 `approved_at` 설정하여 일관성 유지
   - `approval_status`(승인 여부)와 `status`(화력 상태) 독립적 관리

### 주의사항

1. **최대 처리 개수 제한**
   - 점화 30개 + 논란중 15개 + 최근 15개 = 최대 60개
   - 120초 타임아웃 내에서 안전하게 처리 가능
   
2. **중복 제거 로직**
   - 같은 이슈가 여러 카테고리에 속할 수 있음
   - Map을 사용하여 중복 제거 (우선순위 순서 유지)

3. **정렬 순서**
   - 점화: 반려 우선 (approval_status DESC), 오래된 것부터 (approved_at ASC)
   - 논란중: 업데이트 안 된 것부터 (updated_at ASC)
   - 최근: 최신순 (updated_at DESC)

4. **반려 이슈의 상태 관리**
   - `approval_status='반려'`여도 `status`는 화력에 따라 점화/논란중/종결 가능
   - 두 개념은 독립적으로 관리됨

## 관련 파일

- `app/api/cron/recalculate-heat/route.ts` - Cron 작업 (개선됨)
- `lib/analysis/status-transition.ts` - 상태 전환 로직
- `lib/analysis/heat.ts` - 화력 계산

## 추가 개선 가능 사항

1. **동적 limit 조정**
   - 환경변수로 각 카테고리별 limit 설정
   - 예: `CRON_IGNITE_LIMIT=30`, `CRON_DEBATE_LIMIT=15`

2. **상태별 처리 주기 차별화**
   - 점화: 5분마다 (더 자주)
   - 논란중: 10분마다 (현재)
   - 종결: 1시간마다 (덜 자주)

3. **모니터링 강화**
   - 상태별 처리 개수 추적
   - 상태 전환 실패 알림
   - 오래 방치된 이슈 감지 (24시간 이상)
