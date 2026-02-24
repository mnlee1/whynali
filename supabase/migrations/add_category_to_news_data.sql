-- news_data 테이블에 category 컬럼 추가
-- 뉴스 수집 시 카테고리(연예·스포츠·정치·사회·기술)를 저장하여
-- 이슈 후보 평가(inferCategory)가 올바르게 동작하도록 한다.

ALTER TABLE news_data
    ADD COLUMN IF NOT EXISTS category TEXT
        CHECK (category IN ('연예', '스포츠', '정치', '사회', '기술'));

CREATE INDEX IF NOT EXISTS idx_news_data_category ON news_data(category);
