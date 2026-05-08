-- KPI 목표 관리 테이블
-- 월별 KPI 목표를 저장하고 관리합니다

-- 1. KPI 목표 기본 정보
CREATE TABLE IF NOT EXISTS kpi_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- 최종 목표
    target_users INT NOT NULL,
    target_active_issues INT NOT NULL,
    target_comments INT NOT NULL,
    target_reactions INT NOT NULL,
    target_votes INT NOT NULL,
    
    -- 참여율 목표
    target_comment_participation DECIMAL(5,2) NOT NULL,
    target_reaction_participation DECIMAL(5,2) NOT NULL,
    target_vote_participation DECIMAL(5,2) NOT NULL,
    
    -- 일평균 목표
    target_daily_new_users DECIMAL(5,2) NOT NULL,
    target_daily_comments DECIMAL(5,2) NOT NULL,
    target_daily_reactions DECIMAL(5,2) NOT NULL,
    
    -- 메모
    notes TEXT,
    
    -- 활성 여부
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(period_year, period_month)
);

-- 2. 주차별 마일스톤
CREATE TABLE IF NOT EXISTS kpi_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES kpi_goals(id) ON DELETE CASCADE,
    week_number INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_users INT NOT NULL,
    target_comments INT NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(goal_id, week_number)
);

-- 3. 일별 스냅샷 (선택적 - 추후 추가 가능)
CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL UNIQUE,
    users_count INT NOT NULL,
    active_issues_count INT NOT NULL,
    comments_count INT NOT NULL,
    reactions_count INT NOT NULL,
    votes_count INT NOT NULL,
    
    comment_participation DECIMAL(5,2),
    reaction_participation DECIMAL(5,2),
    vote_participation DECIMAL(5,2),
    
    daily_new_users DECIMAL(5,2),
    daily_comments DECIMAL(5,2),
    daily_reactions DECIMAL(5,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_kpi_goals_period ON kpi_goals(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_kpi_goals_active ON kpi_goals(is_active);
CREATE INDEX IF NOT EXISTS idx_kpi_milestones_goal ON kpi_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date ON kpi_snapshots(snapshot_date);

-- 업데이트 트리거
CREATE OR REPLACE FUNCTION update_kpi_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kpi_goals_updated_at
    BEFORE UPDATE ON kpi_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_kpi_goals_updated_at();

-- 시드 데이터: 2026년 6월 목표 (docs/84_6월_KPI_목표_확정.md 기준)
INSERT INTO kpi_goals (
    period_year,
    period_month,
    period_start,
    period_end,
    target_users,
    target_active_issues,
    target_comments,
    target_reactions,
    target_votes,
    target_comment_participation,
    target_reaction_participation,
    target_vote_participation,
    target_daily_new_users,
    target_daily_comments,
    target_daily_reactions,
    notes,
    is_active
) VALUES (
    2026,
    6,
    '2026-06-01',
    '2026-06-30',
    50,
    15,
    60,
    150,
    120,
    20.0,
    50.0,
    15.0,
    1.0,
    2.0,
    4.0,
    '6월 목표 (적정 시나리오): 2.3배 성장, 주간 25% 성장률 목표',
    true
) ON CONFLICT (period_year, period_month) DO UPDATE SET
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    target_users = EXCLUDED.target_users,
    target_active_issues = EXCLUDED.target_active_issues,
    target_comments = EXCLUDED.target_comments,
    target_reactions = EXCLUDED.target_reactions,
    target_votes = EXCLUDED.target_votes,
    target_comment_participation = EXCLUDED.target_comment_participation,
    target_reaction_participation = EXCLUDED.target_reaction_participation,
    target_vote_participation = EXCLUDED.target_vote_participation,
    target_daily_new_users = EXCLUDED.target_daily_new_users,
    target_daily_comments = EXCLUDED.target_daily_comments,
    target_daily_reactions = EXCLUDED.target_daily_reactions,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- 6월 주차별 마일스톤
INSERT INTO kpi_milestones (goal_id, week_number, start_date, end_date, target_users, target_comments)
SELECT 
    g.id,
    w.week_number,
    w.start_date::DATE,
    w.end_date::DATE,
    w.target_users,
    w.target_comments
FROM kpi_goals g
CROSS JOIN (
    VALUES 
        (1, '2026-06-01', '2026-06-07', 28, 20),
        (2, '2026-06-08', '2026-06-14', 35, 35),
        (3, '2026-06-15', '2026-06-21', 44, 48),
        (4, '2026-06-22', '2026-06-30', 50, 60)
) AS w(week_number, start_date, end_date, target_users, target_comments)
WHERE g.period_year = 2026 AND g.period_month = 6
ON CONFLICT (goal_id, week_number) DO UPDATE SET
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    target_users = EXCLUDED.target_users,
    target_comments = EXCLUDED.target_comments;
