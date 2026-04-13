-- 이슈 테이블에 대표 이미지 인덱스 추가
-- thumbnail_urls 배열 중 어떤 이미지를 대표로 사용할지 지정
-- 기본값은 0 (첫 번째 이미지)

ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS primary_thumbnail_index SMALLINT DEFAULT 0;

COMMENT ON COLUMN issues.primary_thumbnail_index IS '대표 이미지 인덱스 (thumbnail_urls 배열 내 위치, 기본값 0)';
