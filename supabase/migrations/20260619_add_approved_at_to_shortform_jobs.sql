-- supabase/migrations/20260619_add_approved_at_to_shortform_jobs.sql
--
-- shortform_jobs에 approved_at 컬럼 추가
--
-- 기존 쿼리가 created_at(job 생성 시각)으로 필터링해서 KPI 숏폼 카운트가 0이 되는 버그 수정.
-- issues 테이블의 approved_at과 동일한 방식으로 승인 시각을 별도 기록한다.

ALTER TABLE shortform_jobs
    ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- 기존 approved 상태 행은 updated_at으로 소급 적용 (근사치)
UPDATE shortform_jobs
    SET approved_at = updated_at
    WHERE approval_status = 'approved' AND approved_at IS NULL;

COMMENT ON COLUMN shortform_jobs.approved_at IS '어드민 승인 시각 (승인 시 명시적으로 기록)';
