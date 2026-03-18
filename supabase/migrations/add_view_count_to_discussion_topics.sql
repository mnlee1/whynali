-- supabase/migrations/add_view_count_to_discussion_topics.sql
--
-- discussion_topics 테이블에 view_count 컬럼 추가
-- 토론 상세 페이지 방문 시 증가

ALTER TABLE discussion_topics
    ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

-- 조회수 원자적 증가 함수
CREATE OR REPLACE FUNCTION increment_discussion_view_count(p_topic_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE discussion_topics
    SET view_count = view_count + 1
    WHERE id = p_topic_id;
$$;
