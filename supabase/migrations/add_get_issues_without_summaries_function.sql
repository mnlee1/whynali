-- supabase/migrations/add_get_issues_without_summaries_function.sql
-- 타임라인 요약이 없는 이슈를 찾는 RPC 함수

CREATE OR REPLACE FUNCTION get_issues_without_summaries(limit_count INT DEFAULT 30)
RETURNS TABLE (
    id UUID,
    title TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT i.id, i.title
    FROM issues i
    LEFT JOIN timeline_summaries ts ON i.id = ts.issue_id
    WHERE i.approval_status = '승인'
    AND ts.id IS NULL  -- timeline_summaries가 없는 경우
    AND EXISTS (
        SELECT 1 FROM timeline_points tp WHERE tp.issue_id = i.id
    )  -- timeline_points는 있어야 함
    ORDER BY i.created_at DESC
    LIMIT limit_count;
END;
$$;

-- 함수 설명 추가
COMMENT ON FUNCTION get_issues_without_summaries IS '타임라인 포인트는 있지만 요약이 생성되지 않은 승인된 이슈를 찾습니다.';
