# 실서버 마이그레이션 적용 가이드

## 적용해야 할 마이그레이션

1. `20260416_add_deleted_by_admin_visibility.sql`
2. `20260416_add_pending_reason_to_comments.sql`

## 방법 1: Supabase 대시보드 사용 (추천)

1. [Supabase 대시보드](https://app.supabase.com) 접속
2. **whynali-main** 프로젝트 선택
3. 좌측 메뉴에서 **SQL Editor** 클릭
4. 아래 SQL을 순서대로 실행:

### 1단계: deleted_by_admin 추가

```sql
-- 관리자 삭제와 작성자 삭제 구분을 위한 visibility 값 추가
-- 기존: 'deleted' (작성자 삭제)
-- 신규: 'deleted_by_admin' (관리자 삭제)

-- 1. CHECK 제약 조건 삭제
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_visibility_check;

-- 2. CHECK 제약 조건 재생성 (deleted_by_admin 추가)
ALTER TABLE comments ADD CONSTRAINT comments_visibility_check 
    CHECK (visibility IN ('public', 'pending_review', 'deleted', 'deleted_by_admin'));
```

### 2단계: pending_reason 추가

```sql
-- pending_reason 컬럼 추가: 신고 vs 금칙어 숨김 구분
-- 'safety': 금칙어(세이프티봇)로 인한 pending_review
-- 'report': 신고 임계값 초과로 인한 pending_review

-- 1. pending_reason 컬럼 추가
ALTER TABLE comments ADD COLUMN IF NOT EXISTS pending_reason TEXT;

-- 2. CHECK 제약 조건 추가
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_pending_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_pending_reason_check 
    CHECK (pending_reason IN ('safety', 'report') OR pending_reason IS NULL);

-- 3. 기존 pending_review 데이터를 모두 'safety'로 마이그레이션
UPDATE comments 
SET pending_reason = 'safety' 
WHERE visibility = 'pending_review' AND pending_reason IS NULL;

-- 4. 인덱스 추가 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_comments_pending_reason 
ON comments(pending_reason) 
WHERE pending_reason IS NOT NULL;
```

## 방법 2: Supabase CLI 사용

```bash
# whynali 프로젝트로 이동
cd /Users/nhn/Documents/pub/@react/whynali

# Supabase CLI로 실서버에 연결
supabase link --project-ref [whynali-main-project-ref]

# 마이그레이션 적용
supabase db push

# 또는 개별 파일 실행
supabase db execute --file supabase/migrations/20260416_add_deleted_by_admin_visibility.sql
supabase db execute --file supabase/migrations/20260416_add_pending_reason_to_comments.sql
```

## 적용 후 확인

실서버 DB에서 다음 쿼리로 확인:

```sql
-- 1. pending_reason 컬럼 존재 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'comments' AND column_name = 'pending_reason';

-- 2. 기존 pending_review 댓글이 'safety'로 설정되었는지 확인
SELECT id, visibility, pending_reason, created_at
FROM comments
WHERE visibility = 'pending_review'
ORDER BY created_at DESC
LIMIT 10;

-- 3. CHECK 제약 조건 확인
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE 'comments_%';
```

## 주의사항

- 마이그레이션 적용 전 **백업 권장**
- 테스트서버(whynali-dev)에서 먼저 테스트 후 실서버 적용
- 적용 후 whynali.com에서 댓글 기능 정상 작동 확인
