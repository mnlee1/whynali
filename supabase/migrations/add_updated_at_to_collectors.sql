-- supabase/migrations/add_updated_at_to_collectors.sql
--
-- community_data와 news_data에 updated_at 컬럼 추가
-- upsert 시 마지막 업데이트 시각을 기록하여 조회수/댓글수 변화를 추적 가능하게 함
--

-- community_data에 updated_at 추가
ALTER TABLE community_data
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- news_data에 updated_at 추가 (일관성 유지)
ALTER TABLE news_data
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 기존 레코드의 updated_at을 created_at으로 초기화
UPDATE community_data SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE news_data SET updated_at = created_at WHERE updated_at IS NULL;

-- updated_at 인덱스 추가 (정렬 성능 향상)
CREATE INDEX IF NOT EXISTS idx_community_data_updated_at ON community_data(updated_at);
CREATE INDEX IF NOT EXISTS idx_news_data_updated_at ON news_data(updated_at);
