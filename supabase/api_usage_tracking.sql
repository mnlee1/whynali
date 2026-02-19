-- API 사용량 추적 테이블
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL, -- 'naver_news'
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count INTEGER DEFAULT 0,
    daily_limit INTEGER DEFAULT 25000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(api_name, date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(date);
CREATE INDEX IF NOT EXISTS idx_api_usage_name_date ON api_usage(api_name, date);

COMMENT ON TABLE api_usage IS '네이버 API 등 외부 API 사용량 추적';
COMMENT ON COLUMN api_usage.api_name IS 'API 이름 (예: naver_news)';
COMMENT ON COLUMN api_usage.date IS '사용 날짜';
COMMENT ON COLUMN api_usage.call_count IS '호출 횟수';
COMMENT ON COLUMN api_usage.daily_limit IS '일일 한도';
