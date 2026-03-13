-- discussion_topics 테이블에 updated_at 컬럼 추가
ALTER TABLE discussion_topics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- body 수정 시 updated_at 자동 갱신 트리거
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
