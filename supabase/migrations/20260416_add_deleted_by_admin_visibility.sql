-- 관리자 삭제와 작성자 삭제 구분을 위한 visibility 값 추가
-- 기존: 'deleted' (작성자 삭제)
-- 신규: 'deleted_by_admin' (관리자 삭제)

-- 1. CHECK 제약 조건 삭제
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_visibility_check;

-- 2. CHECK 제약 조건 재생성 (deleted_by_admin 추가)
ALTER TABLE comments ADD CONSTRAINT comments_visibility_check 
    CHECK (visibility IN ('public', 'pending_review', 'deleted', 'deleted_by_admin'));
