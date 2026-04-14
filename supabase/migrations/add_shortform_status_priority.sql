-- supabase/migrations/add_shortform_status_priority.sql
--
-- shortform_jobs 테이블에 status_priority 생성 컬럼 추가
--
-- 전체 목록 조회 시 대기 → 승인 → 반려 순으로 정렬하기 위한 컬럼.
-- GENERATED ALWAYS AS (STORED) 로 자동 계산되어 별도 관리 불필요.

ALTER TABLE shortform_jobs
ADD COLUMN IF NOT EXISTS status_priority integer GENERATED ALWAYS AS (
    CASE approval_status
        WHEN 'pending'  THEN 0
        WHEN 'approved' THEN 1
        WHEN 'rejected' THEN 2
        ELSE 3
    END
) STORED;

-- 전체 탭 정렬용 인덱스 (status_priority ASC, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_shortform_jobs_priority_date
    ON shortform_jobs (status_priority ASC, created_at DESC);
