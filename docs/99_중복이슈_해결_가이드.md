# 중복 이슈 등록 문제 해결

**문제:** 같은 이슈 제목이 24시간 내에 2개 이상 등록되는 Race Condition 발생

**원인:**
1. GitHub Actions Cron이 30분마다 동시에 실행될 때 Race Condition 발생
2. 중복 체크 시점과 이슈 등록 시점 사이에 다른 요청이 끼어들 수 있음
3. 임시 이슈 생성(`approval_status: null`) 단계에서 중복 체크 누락

**해결 방법:**

## 1. 코드 레벨 수정 (완료)

### 변경 사항 1: 중복 체크 함수 분리 및 재사용
- `checkForDuplicateIssue()` 함수를 분리하여 여러 시점에서 재사용 가능하도록 개선
- 파일: `lib/candidate/issue-candidate.ts` (라인 968-1019)

### 변경 사항 2: Race Condition 최종 방어 로직 추가
- 임시 이슈 생성 직후 최종 중복 체크 수행 (라인 1090-1139)
- 중복 발견 시 방금 생성한 임시 이슈 삭제 후 기존 이슈에 데이터 연결
- PostgreSQL error code 23505 (Unique constraint violation) 핸들링 추가

### 변경 사항 3: 에러 핸들링 강화
- 임시 이슈 생성 실패 시 재체크 로직 추가
- 중복 발견 시 기존 이슈에 수집 건 연결 후 continue

## 2. 데이터베이스 인덱스 추가 (수동 실행 필요)

### 마이그레이션 파일
`supabase/migrations/20260304084804_add_partial_unique_index_for_issues_title.sql`

### 실행 방법

**Option 1: Supabase Dashboard 사용**
1. Supabase Dashboard 접속: https://supabase.com/dashboard
2. 프로젝트 선택 (banhuygrqgezhlpyytyc)
3. SQL Editor 메뉴 선택
4. 아래 SQL 실행:

```sql
-- Partial Unique Index 생성
-- 24시간 이내 이슈의 제목 검색 속도 향상
CREATE INDEX IF NOT EXISTS issues_title_created_at_idx 
    ON issues (title, created_at DESC)
    WHERE created_at >= NOW() - INTERVAL '24 hours';
```

**Option 2: Supabase CLI 사용**
```bash
cd /Users/nhn/Documents/pub/@react/whynali
supabase db push
```

### 인덱스 효과
- 24시간 이내 이슈의 제목 중복 체크 쿼리 속도 향상
- 자동 정리: 24시간 이후 이슈는 인덱스에서 자동 제외

## 3. 기존 중복 데이터 정리

### 정리 스크립트 실행
```bash
cd /Users/nhn/Documents/pub/@react/whynali

NEXT_PUBLIC_SUPABASE_URL="https://banhuygrqgezhlpyytyc.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmh1eWdycWdlemhscHl5dHljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMzQ0MSwiZXhwIjoyMDg2MTc5NDQxfQ.dMrfD0-TAl7fTfdBVQHNMQ0e5w8XCl7aT0oh7lmAVvY" \
npx tsx scripts/cleanup_duplicate_issues.ts
```

### 스크립트 동작
1. 최근 24시간 내 모든 이슈 조회
2. 같은 제목의 이슈를 그룹핑
3. 각 그룹에서 유지할 이슈 선택 (우선순위: 승인 > 화력 > 생성 시각)
4. 나머지 이슈의 수집 건을 유지할 이슈로 이동
5. 중복 이슈 삭제

### 실행 결과 (2026-03-04)
```
최근 24시간 이슈: 60건
중복 발견: 1개 제목
병합된 그룹: 1개
삭제된 이슈: 1건
```

## 4. 모니터링

### 중복 발생 확인 쿼리
```sql
-- 24시간 내 중복 제목 확인
SELECT title, COUNT(*) as count
FROM issues
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY title
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

### 로그 확인
Cron 실행 시 다음 로그가 출력됩니다:
- `[Race Condition 감지]`: 동시 등록 시도 감지
- `[Race Condition 방어]`: 임시 이슈 생성 후 중복 발견
- `[기존 이슈 연결]`: 중복 발견 시 기존 이슈에 데이터 연결

## 5. 배포

### Vercel 자동 배포
- 코드 변경사항이 `main` 브랜치에 머지되면 자동 배포됨
- 배포 완료 후 다음 Cron 실행부터 적용됨 (최대 30분 대기)

### 수동 배포 확인
```bash
# 최신 커밋 확인
git log -1

# Vercel 배포 상태 확인
vercel ls
```

## 테스트

### 로컬 테스트
```bash
# 이슈 후보 자동 생성 API 직접 호출
curl -X GET http://localhost:3000/api/cron/auto-create-issue \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "User-Agent: GitHub-Actions"
```

### 프로덕션 테스트
```bash
# GitHub Actions workflow 수동 실행
# .github/workflows/prod-cron-auto-create-issue.yml 에서 'workflow_dispatch' 사용
```

## 파일 변경 내역

### 수정된 파일
- `lib/candidate/issue-candidate.ts`: Race Condition 방어 로직 추가

### 추가된 파일
- `scripts/cleanup_duplicate_issues.ts`: 중복 이슈 정리 스크립트
- `supabase/migrations/20260304084804_add_partial_unique_index_for_issues_title.sql`: 인덱스 마이그레이션
- `docs/fix-duplicate-issues.md`: 이 문서

## 주의사항

1. **인덱스 적용**: Supabase Dashboard에서 SQL을 수동으로 실행해야 함
2. **환경 변수**: 로컬 스크립트 실행 시 환경 변수 명시 필요
3. **Rate Limit**: AI 중복 체크 시 3초 간격으로 실행됨 (GROQ API 제한)
4. **자동 정리**: 정리 스크립트는 수동 실행만 가능 (자동 스케줄링 없음)
