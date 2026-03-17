-- votes 테이블에 is_ai_generated 컬럼 추가
-- 사용법: Supabase Dashboard > SQL Editor에서 이 파일 내용을 실행
--        또는 로컬에서 supabase migration apply 명령 사용

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- 마이그레이션 적용 후:
-- app/api/admin/votes/route.ts 파일의 주석 처리된 코드를 활성화하세요
