-- thumbnail_url (단일) → thumbnail_urls TEXT[] (배열) 변경
-- 실서버/테스트서버 모두 적용 필요

ALTER TABLE issues DROP COLUMN IF EXISTS thumbnail_url;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS thumbnail_urls TEXT[] DEFAULT '{}';
