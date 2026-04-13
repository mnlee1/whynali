-- 테스트서버 DB 마이그레이션 확인 및 적용
-- Supabase SQL 에디터에서 실행

-- 1. primary_thumbnail_index 컬럼이 있는지 확인
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'issues' 
AND column_name = 'primary_thumbnail_index';

-- 2. 컬럼이 없다면 추가 (있으면 스킵됨)
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS primary_thumbnail_index SMALLINT DEFAULT 0;

-- 3. 기존 데이터 확인 (thumbnail_urls가 있는 이슈들)
SELECT id, title, 
    array_length(thumbnail_urls, 1) as image_count,
    primary_thumbnail_index
FROM issues 
WHERE thumbnail_urls IS NOT NULL 
AND array_length(thumbnail_urls, 1) > 0
LIMIT 10;

-- 4. NULL인 경우 0으로 초기화
UPDATE issues 
SET primary_thumbnail_index = 0 
WHERE primary_thumbnail_index IS NULL 
AND thumbnail_urls IS NOT NULL;
