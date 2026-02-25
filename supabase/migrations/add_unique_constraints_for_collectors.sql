-- supabase/migrations/add_unique_constraints_for_collectors.sql
--
-- 수집 중복 방지 UNIQUE 제약 추가
--
-- 기존: 사전 조회 후 INSERT (Cron 동시 실행 시 race condition으로 중복 적재 가능)
-- 개선: DB UNIQUE 제약 + upsert(onConflict) 기반으로 원자적 중복 방지
--
-- 주의: 기존 중복 데이터가 있으면 제약 추가 실패. 아래 DISTINCT 쿼리로 중복 제거 후 실행.
--
-- 중복 제거 예시 (필요 시):
--   DELETE FROM news_data WHERE id NOT IN (
--     SELECT MIN(id) FROM news_data GROUP BY link
--   );
--   DELETE FROM community_data WHERE id NOT IN (
--     SELECT MIN(id) FROM community_data GROUP BY url
--   );

ALTER TABLE news_data
    ADD CONSTRAINT news_data_link_unique UNIQUE (link);

ALTER TABLE community_data
    ADD CONSTRAINT community_data_url_unique UNIQUE (url);
