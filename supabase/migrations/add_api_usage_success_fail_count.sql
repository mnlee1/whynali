-- supabase/migrations/add_api_usage_success_fail_count.sql
--
-- API 사용량 성공/실패 카운터 컬럼 추가
--
-- 기존: call_count (저장 건수 기준)
-- 개선: call_count (호출 횟수 기준), success_count, fail_count 분리

ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;

-- 기존 call_count 데이터를 success_count로 마이그레이션 (근사치)
UPDATE api_usage SET success_count = call_count WHERE success_count = 0;
