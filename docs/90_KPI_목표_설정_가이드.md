# KPI 목표 설정 가이드

매월 새로운 KPI 목표를 설정하는 방법입니다.

## 빠른 시작

### 1단계: 템플릿 복사

```bash
cp supabase/migrations/TEMPLATE_kpi_goals.sql supabase/migrations/$(date +%Y%m%d)_kpi_goals_july.sql
```

또는 직접 `TEMPLATE_kpi_goals.sql` 파일을 복사하세요.

### 2단계: 값 수정

파일을 열고 주석에 표시된 부분만 수정:

```sql
-- 연도/월 설정
period_year: 2026,
period_month: 7,
period_start: '2026-07-01',
period_end: '2026-07-31',

-- 최종 목표 설정
target_users: 100,           -- 월말 목표 가입자
target_comments: 150,        -- 월말 목표 댓글
-- ... 나머지 값들
```

### 3단계: Supabase에서 실행

1. Supabase Dashboard 접속
2. SQL Editor 열기
3. 수정한 파일 내용 복사 → 붙여넣기
4. Run 클릭

### 4단계: 확인

KPI 대시보드(`/admin/kpi`)에서 해당 월 선택하여 목표 확인

## 목표 계산 팁

### 현실적인 목표 설정

```
현재 상태 확인 → KPI 대시보드에서 확인

성장 시나리오 선택:
- 보수적: 현재 × 1.5배
- 적정: 현재 × 2-3배
- 도전적: 현재 × 4-5배

예시:
현재 50명 → 적정 목표 100-150명
```

### 주차별 마일스톤 계산

**방법 1: 선형 증가**
```
시작: 50명
목표: 100명 (50명 증가)
4주 → 주당 12-13명 증가

1주: 62명
2주: 75명
3주: 88명
4주: 100명
```

**방법 2: 복리 성장** (더 현실적)
```
주간 성장률: 20%

1주: 50 × 1.2 = 60명
2주: 60 × 1.2 = 72명
3주: 72 × 1.2 = 86명
4주: 86 × 1.2 = 103명
```

온라인 계산기 사용:
```python
# Python으로 계산
current = 50
weekly_growth = 0.20
weeks = 4

for week in range(1, weeks + 1):
    target = int(current * (1 + weekly_growth) ** week)
    print(f"{week}주차: {target}명")
```

## 자주 묻는 질문

### Q. 목표를 나중에 수정할 수 있나요?
A. 네, 같은 SQL을 다시 실행하면 업데이트됩니다 (`ON CONFLICT` 처리).

### Q. 이전 월 목표를 참고하려면?
A. Supabase Table Editor → `kpi_goals` 테이블 확인

### Q. 주차별 마일스톤은 필수인가요?
A. 네, 대시보드에서 진행 상황을 주차별로 보여줍니다.

### Q. 주차가 5주인 경우는?
A. 템플릿의 주석을 해제하고 5주차 줄을 추가하세요.

## 예시: 7월 목표 설정

```sql
-- 기본 정보
period_year: 2026
period_month: 7
period_start: '2026-07-01'
period_end: '2026-07-31'

-- 현재 상태 (6월 말)
-- 가입자: 50명
-- 댓글: 60개

-- 7월 목표 (2배 성장)
target_users: 100          -- 50 → 100명
target_comments: 120       -- 60 → 120개
target_reactions: 300      -- 비례 증가
target_votes: 240          -- 비례 증가

-- 주차별 (복리 20% 성장)
1주: 60명, 30댓글
2주: 72명, 60댓글
3주: 86명, 90댓글
4주: 100명, 120댓글
```

## 문제 해결

### 에러: unique constraint violation
→ 해당 월 목표가 이미 있습니다. SQL이 자동으로 업데이트하므로 문제없습니다.

### 대시보드에 목표가 안 보임
→ `is_active: true` 확인, 연도/월이 정확한지 확인

### 주차별 마일스톤이 안 보임
→ `kpi_milestones` 테이블에 데이터가 있는지 확인

---

**다음 달 목표 설정 시기:** 매월 25일경 (월말 전에 설정)
