ALTER TABLE discussion_topics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION update_discussion_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discussion_topics_updated_at ON discussion_topics;
CREATE TRIGGER trg_discussion_topics_updated_at
  BEFORE UPDATE ON discussion_topics
  FOR EACH ROW EXECUTE FUNCTION update_discussion_topics_updated_at();
