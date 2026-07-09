-- page_views 테이블에 봇 여부 컬럼 추가
-- 저장 시점에 User-Agent를 분석해 봇 여부를 세팅, 집계 시 is_bot=false 필터로 단순화

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_page_views_is_bot ON page_views(is_bot);

-- 기존 데이터에 봇 여부 일괄 업데이트
UPDATE page_views SET is_bot = true
WHERE
    user_agent ILIKE '%bot%'
    OR user_agent ILIKE '%crawler%'
    OR user_agent ILIKE '%spider%'
    OR user_agent ILIKE '%facebookexternalhit%'
    OR user_agent ILIKE '%whatsapp%'
    OR user_agent ILIKE '%telegram%'
    OR user_agent ILIKE '%headless%'
    OR user_agent ILIKE '%python%'
    OR user_agent ILIKE '%curl%'
    OR user_agent ILIKE '%wget%'
    OR user_agent ILIKE '%scrapy%';
