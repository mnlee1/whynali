-- issues 테이블에 Unsplash 이미지 URL 컬럼 추가
-- 제거 방법: ALTER TABLE issues DROP COLUMN IF EXISTS thumbnail_url;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
