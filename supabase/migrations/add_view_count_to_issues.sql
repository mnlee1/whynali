-- supabase/migrations/add_view_count_to_issues.sql
--
-- issues 테이블에 view_count 컬럼 추가
-- 이슈 상세 페이지 방문 시 증가

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

-- 조회수 기준 정렬/필터 인덱스
CREATE INDEX IF NOT EXISTS idx_issues_view_count ON issues(view_count DESC);

-- 조회수 원자적 증가 함수
CREATE OR REPLACE FUNCTION increment_issue_view_count(p_issue_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE issues
    SET view_count = view_count + 1
    WHERE id = p_issue_id;
$$;
