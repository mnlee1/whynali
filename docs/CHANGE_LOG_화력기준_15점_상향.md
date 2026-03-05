# 화력 기준 15점 상향 변경 이력

**날짜**: 2026-03-05
**변경 사유**: 이슈 승인 기준 강화 (10점 → 15점)

## 변경 내용

### 1. 환경변수 변경

| 환경변수 | 변경 전 | 변경 후 | 설명 |
|---------|--------|--------|------|
| `CANDIDATE_MIN_HEAT_TO_REGISTER` | 10 | 15 | 이슈 등록 후 화력이 이 값 미만이면 자동 반려 |

**적용 규칙**:
- 이슈 등록: 화력 15점 이상이어야 대기 상태로 등록
- 자동 반려: 대기 상태 이슈가 화력 15점 미만이면 자동 반려 처리

### 2. 파일 변경 목록

#### 2.1 환경변수 파일
- `.env.local`: `CANDIDATE_MIN_HEAT_TO_REGISTER=15`
- `.env.example`: 주석 기본값 10 → 15

#### 2.2 코드 파일
- `lib/candidate/issue-candidate.ts`:
  - 기본값 `'10'` → `'15'`
  - 주석 설명 10점 → 15점
  - 자동 승인 시 `approval_heat_index` 저장 추가

- `app/api/cron/recalculate-heat/route.ts`:
  - 기본값 `'10'` → `'15'`
  - `AUTO_APPROVE_THRESHOLD` 오류 수정 (10 → 30)
  - 자동 승인/반려 시 `approval_heat_index` 저장 추가

- `app/api/admin/issues/route.ts`:
  - 기본값 `'10'` → `'15'`

- `app/admin/issues/page.tsx`:
  - 화력 범위 기준 업데이트 (10-29 → 15-29)
  - 이슈 등록 기준 10점 → 15점
  - 자동 반려 기준 10점 → 15점
  - 계산 예시 업데이트
  - `getHeatMeta` 함수: 승인 당시 화력 표시 기능 추가

#### 2.3 문서 파일
- `docs/07_이슈등록_화력_정렬_규격.md`:
  - §1.3 알람 조건: "화력 < 10점" → "화력 < 15점"

#### 2.4 타입 정의
- `types/issue.ts`:
  - `Issue` 인터페이스에 `approval_heat_index` 필드 추가

#### 2.5 데이터베이스 마이그레이션
- `supabase/migrations/20260305140000_add_approval_heat_index.sql`:
  - `issues` 테이블에 `approval_heat_index` 컬럼 추가

### 3. 신규 기능: 승인 당시 화력 저장

**목적**: 관리자가 "왜 이 이슈가 자동 승인/반려됐는지" 근거를 확인할 수 있도록 함

**동작 방식**:
- 자동 승인 시: 당시 화력을 `approval_heat_index`에 저장
- 자동 반려 시: 당시 화력을 `approval_heat_index`에 저장
- 관리자 페이지: 현재 화력과 승인 당시 화력을 함께 표시

**표시 예시**:
```
현재 화력: 25점 ↓ (승인시 32점)
```

이렇게 표시되면 "승인 당시에는 30점 이상이었으나 시간 경과로 하락했음"을 바로 알 수 있습니다.

## Vercel 환경변수 설정

로컬 개발 환경은 `.env.local` 수정으로 적용되지만,
Vercel 배포 환경은 별도로 환경변수를 업데이트해야 합니다.

### 설정 방법

1. Vercel 대시보드 접속
2. 프로젝트 선택 (whynali)
3. Settings → Environment Variables
4. `CANDIDATE_MIN_HEAT_TO_REGISTER` 찾아서 Edit
5. Value: `10` → `15` 변경
6. Save
7. Deployments 탭 → 최신 배포의 ⋯ 메뉴 → Redeploy

### 확인 방법

1. 배포 로그에서 환경변수 확인:
```
Build Environment Variables:
CANDIDATE_MIN_HEAT_TO_REGISTER=15
```

2. 관리자 페이지에서 대기 이슈 목록 확인:
   - 화력 15점 미만 이슈는 자동 반려되어 목록에 표시 안 됨
   - 화력 15점 이상 이슈만 대기 상태로 표시

## 데이터베이스 마이그레이션

### 로컬 환경
```bash
cd whynali
npx supabase db push
```

### Vercel/Production 환경
Supabase 대시보드에서 마이그레이션 적용:
1. Supabase 대시보드 → SQL Editor
2. `20260305140000_add_approval_heat_index.sql` 내용 복사
3. 실행

## 영향 범위

### 이슈 등록 (evaluateCandidates)
- 임시 이슈 생성 후 화력 계산
- 화력 15점 미만: 이슈 삭제 (등록 안 됨)
- 화력 15점 이상: 대기 또는 승인 상태로 등록
- 자동 승인 시: 당시 화력 저장

### 이슈 재평가 (recalculate-heat Cron)
- 대기 상태 이슈 중 화력 15점 미만: 자동 반려 (화력 저장)
- 대기 상태 이슈 중 화력 30점 이상: 자동 승인 (화력 저장)
- 승인된 이슈는 화력 하락해도 반려 안 됨

### 관리자 페이지
- 화력 범위: 15-29 낮음, 15 미만 매우낮음
- 승인 당시 화력 표시: `25점 ↓ (승인시 32점)`
- 화력 하락 이유를 바로 파악 가능

## 롤백 방법

변경사항을 되돌리려면:

1. `.env.local`: `CANDIDATE_MIN_HEAT_TO_REGISTER=10`
2. Vercel 환경변수: `10`으로 변경 후 재배포
3. Git 커밋 되돌리기:
```bash
git revert HEAD
git push
```

4. 데이터베이스 롤백:
```sql
ALTER TABLE issues DROP COLUMN approval_heat_index;
```

## 참고 문서

- `docs/07_이슈등록_화력_정렬_규격.md` - §1.3 알람 조건
- `lib/candidate/issue-candidate.ts` - 이슈 후보 자동 생성 로직
- `app/api/cron/recalculate-heat/route.ts` - 화력 재계산 및 상태 전환
