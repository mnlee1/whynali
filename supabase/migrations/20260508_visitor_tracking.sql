-- 방문자 추적 및 유입 경로 분석 시스템
-- 재미나이 제안 반영: 유입 경로별 데이터, 전환율, 이슈 품질 지표

-- ============================================
-- 1. 방문자 추적 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 방문자 정보
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,                -- 세션 ID (익명 방문자 추적)
    
    -- 페이지 정보
    page_type TEXT NOT NULL,                 -- 'home', 'issue', 'discussion', 'vote', 'profile'
    page_path TEXT NOT NULL,                 -- 전체 경로
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    discussion_id UUID REFERENCES discussion_topics(id) ON DELETE SET NULL,
    
    -- 유입 경로 (재미나이 제안 1번)
    referrer TEXT,                           -- 이전 페이지 URL
    utm_source TEXT,                         -- 'threads', 'instagram', 'twitter', 'direct', 'organic'
    utm_medium TEXT,                         -- 'social', 'cpc', 'email', 'referral'
    utm_campaign TEXT,                       -- 캠페인 이름
    utm_content TEXT,                        -- 콘텐츠 구분
    
    -- 디바이스 정보
    user_agent TEXT,
    device_type TEXT,                        -- 'mobile', 'desktop', 'tablet'
    
    -- 시간 정보
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 인덱스 최적화
    CONSTRAINT page_views_check_page_type CHECK (page_type IN ('home', 'issue', 'discussion', 'vote', 'profile', 'other'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_page_type ON page_views(page_type);
CREATE INDEX IF NOT EXISTS idx_page_views_utm_source ON page_views(utm_source);
CREATE INDEX IF NOT EXISTS idx_page_views_issue_id ON page_views(issue_id) WHERE issue_id IS NOT NULL;

-- ============================================
-- 2. 전환 이벤트 추적 (재미나이 제안 2번)
-- ============================================

CREATE TABLE IF NOT EXISTS conversion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 방문자 정보
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    
    -- 이벤트 정보
    event_type TEXT NOT NULL,                -- 'signup', 'vote', 'comment', 'reaction'
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    discussion_id UUID REFERENCES discussion_topics(id) ON DELETE SET NULL,
    
    -- 유입 경로 (첫 방문 시점)
    first_utm_source TEXT,
    first_utm_campaign TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT conversion_events_check_type CHECK (event_type IN ('signup', 'vote', 'comment', 'reaction'))
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_created_at ON conversion_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conversion_events_event_type ON conversion_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conversion_events_utm_source ON conversion_events(first_utm_source);
CREATE INDEX IF NOT EXISTS idx_conversion_events_session ON conversion_events(session_id);

-- ============================================
-- 3. 일별 집계 테이블 (성능 최적화)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analytics_date DATE NOT NULL UNIQUE,
    
    -- 방문 지표
    total_page_views INT DEFAULT 0,
    unique_visitors INT DEFAULT 0,
    unique_sessions INT DEFAULT 0,
    
    -- 유입 경로별 (재미나이 제안 1번)
    visitors_threads INT DEFAULT 0,
    visitors_instagram INT DEFAULT 0,
    visitors_twitter INT DEFAULT 0,
    visitors_direct INT DEFAULT 0,
    visitors_organic INT DEFAULT 0,
    visitors_other INT DEFAULT 0,
    
    -- 전환 지표 (재미나이 제안 2번)
    signups INT DEFAULT 0,
    votes INT DEFAULT 0,
    comments INT DEFAULT 0,
    reactions INT DEFAULT 0,
    
    -- 전환율 (%)
    signup_rate DECIMAL(5,2) DEFAULT 0,      -- 방문 → 가입
    vote_rate DECIMAL(5,2) DEFAULT 0,        -- 방문 → 투표
    comment_rate DECIMAL(5,2) DEFAULT 0,     -- 방문 → 댓글
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON daily_analytics(analytics_date);

-- ============================================
-- 4. 일별 집계 자동 업데이트 함수
-- ============================================

CREATE OR REPLACE FUNCTION update_daily_analytics()
RETURNS void AS $$
DECLARE
    target_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    INSERT INTO daily_analytics (
        analytics_date,
        total_page_views,
        unique_visitors,
        unique_sessions,
        visitors_threads,
        visitors_instagram,
        visitors_twitter,
        visitors_direct,
        visitors_organic,
        visitors_other,
        signups,
        votes,
        comments,
        reactions
    )
    SELECT
        target_date,
        COUNT(*) as total_page_views,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_visitors,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(*) FILTER (WHERE utm_source = 'threads') as visitors_threads,
        COUNT(*) FILTER (WHERE utm_source = 'instagram') as visitors_instagram,
        COUNT(*) FILTER (WHERE utm_source = 'twitter') as visitors_twitter,
        COUNT(*) FILTER (WHERE utm_source = 'direct' OR (utm_source IS NULL AND referrer IS NULL)) as visitors_direct,
        COUNT(*) FILTER (WHERE utm_source = 'organic' OR (utm_source IS NULL AND referrer IS NOT NULL)) as visitors_organic,
        COUNT(*) FILTER (WHERE utm_source NOT IN ('threads', 'instagram', 'twitter', 'direct', 'organic') AND utm_source IS NOT NULL) as visitors_other,
        (SELECT COUNT(*) FROM conversion_events WHERE DATE(created_at) = target_date AND event_type = 'signup') as signups,
        (SELECT COUNT(*) FROM conversion_events WHERE DATE(created_at) = target_date AND event_type = 'vote') as votes,
        (SELECT COUNT(*) FROM conversion_events WHERE DATE(created_at) = target_date AND event_type = 'comment') as comments,
        (SELECT COUNT(*) FROM conversion_events WHERE DATE(created_at) = target_date AND event_type = 'reaction') as reactions
    FROM page_views
    WHERE DATE(created_at) = target_date
    ON CONFLICT (analytics_date) DO UPDATE SET
        total_page_views = EXCLUDED.total_page_views,
        unique_visitors = EXCLUDED.unique_visitors,
        unique_sessions = EXCLUDED.unique_sessions,
        visitors_threads = EXCLUDED.visitors_threads,
        visitors_instagram = EXCLUDED.visitors_instagram,
        visitors_twitter = EXCLUDED.visitors_twitter,
        visitors_direct = EXCLUDED.visitors_direct,
        visitors_organic = EXCLUDED.visitors_organic,
        visitors_other = EXCLUDED.visitors_other,
        signups = EXCLUDED.signups,
        votes = EXCLUDED.votes,
        comments = EXCLUDED.comments,
        reactions = EXCLUDED.reactions,
        signup_rate = CASE 
            WHEN EXCLUDED.unique_sessions > 0 
            THEN (EXCLUDED.signups::DECIMAL / EXCLUDED.unique_sessions * 100)
            ELSE 0 
        END,
        vote_rate = CASE 
            WHEN EXCLUDED.unique_sessions > 0 
            THEN (EXCLUDED.votes::DECIMAL / EXCLUDED.unique_sessions * 100)
            ELSE 0 
        END,
        comment_rate = CASE 
            WHEN EXCLUDED.unique_sessions > 0 
            THEN (EXCLUDED.comments::DECIMAL / EXCLUDED.unique_sessions * 100)
            ELSE 0 
        END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. RLS (Row Level Security) 설정
-- ============================================

-- 모든 사용자가 자신의 방문 기록 생성 가능
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert page views" ON page_views
    FOR INSERT WITH CHECK (true);

ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert conversion events" ON conversion_events
    FOR INSERT WITH CHECK (true);

-- 관리자만 조회 가능
CREATE POLICY "Only admins can view analytics" ON page_views
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

CREATE POLICY "Only admins can view conversions" ON conversion_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

CREATE POLICY "Only admins can view daily analytics" ON daily_analytics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

-- ============================================
-- ✅ 완료!
-- ============================================
-- 이제 클라이언트 코드에서 page_views 테이블에 데이터를 저장하면
-- 방문자 수, 유입 경로, 전환율을 모두 추적할 수 있습니다.
