-- 왜난리 서비스 마이그레이션: approval_status 기본값 추가
-- 
-- 목적: approval_status가 null인 이슈 방지
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 실행

-- approval_status 기본값을 '대기'로 설정
ALTER TABLE issues 
ALTER COLUMN approval_status SET DEFAULT '대기';

-- 확인 쿼리
SELECT 
    column_name,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'issues'
AND column_name = 'approval_status';
