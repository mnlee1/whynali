-- discussion_topics 테이블에 updated_at 컬럼 추가
-- 사용법: Supabase Dashboard > SQL Editor에서 이 파일 내용을 실행하거나
--        로컬에서 supabase migration apply 명령 사용

ALTER TABLE discussion_topics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- body 수정 시 updated_at 자동 갱신 트리거
-- 상태 변경(승인/마감 등)으로는 updated_at이 갱신되지 않음
CREATE OR REPLACE FUNCTION update_discussion_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discussion_topics_updated_at ON discussion_topics;
CREATE TRIGGER trg_discussion_topics_updated_at
  BEFORE UPDATE ON discussion_topics
  FOR EACH ROW EXECUTE FUNCTION update_discussion_topics_updated_at();
