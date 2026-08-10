-- 홍보 채널(인스타/유튜브/틱톡) 주간·월간 리포트용 수동 입력 통계
-- 조회수·구독자수는 자동 수집 인프라가 없어 관리자가 직접 입력해서 기록으로 쌓아둠

CREATE TABLE IF NOT EXISTS channel_promo_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok')),

    views BIGINT,             -- 해당 기간 동안 새로 발생한 조회수 (전체 누적 아님)
    new_subscribers INT,      -- 해당 기간 신규 구독자 수
    total_subscribers INT,    -- 해당 기간 기준 전체 구독자 수

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (period_type, period_start, platform)
);

CREATE INDEX IF NOT EXISTS idx_channel_promo_stats_period ON channel_promo_stats(period_type, period_start);

ALTER TABLE channel_promo_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view channel promo stats" ON channel_promo_stats
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

CREATE POLICY "Only admins can insert channel promo stats" ON channel_promo_stats
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

CREATE POLICY "Only admins can update channel promo stats" ON channel_promo_stats
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );
