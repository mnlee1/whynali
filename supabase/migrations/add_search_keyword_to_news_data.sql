-- supabase/migrations/add_search_keyword_to_news_data.sql
--
-- news_data 테이블에 search_keyword 컬럼 추가
-- 
-- 트랙A 아키텍처에서는 모든 뉴스가 AI 키워드 검색으로만 수집되므로
-- search_keyword는 필수(NOT NULL) 값입니다.

-- 1. 컬럼 추가 (임시로 NULL 허용)
ALTER TABLE news_data 
ADD COLUMN IF NOT EXISTS search_keyword TEXT;

-- 2. 기존 데이터 정리: search_keyword가 NULL인 레거시 뉴스 삭제
-- (트랙A 이전에 수집된 일반 뉴스는 더 이상 사용 안 함)
DELETE FROM news_data WHERE search_keyword IS NULL OR search_keyword = '';

-- 3. NOT NULL 제약 조건 적용
ALTER TABLE news_data 
ALTER COLUMN search_keyword SET NOT NULL;

-- 4. 컬럼 설명
COMMENT ON COLUMN news_data.search_keyword IS '트랙A에서 AI가 추출한 검색 키워드 (모든 뉴스에 필수)';

-- 5. 인덱스 추가 (키워드별 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_news_data_search_keyword 
    ON news_data(search_keyword);
