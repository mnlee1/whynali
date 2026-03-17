ALTER TABLE discussion_topics
  ADD COLUMN IF NOT EXISTS auto_end_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_discussion_topics_auto_end_date
  ON discussion_topics(auto_end_date)
  WHERE approval_status = '진행중';
