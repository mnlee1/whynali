-- KPI 6월 목표 업데이트 + 운영 KPI 컬럼 추가
-- 기준: 신규 가입자 100명, 이슈 일 3개, 숏폼 플랫폼별 일 3개, 익월 +20%

-- 1. 신규 컬럼 추가
ALTER TABLE kpi_goals
    ADD COLUMN IF NOT EXISTS target_daily_issues INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS target_daily_shortforms_per_platform INT NOT NULL DEFAULT 3;

-- 2. 6월 목표값 업데이트
UPDATE kpi_goals SET
    target_users                           = 100,
    target_active_issues                   = 20,
    target_comments                        = 300,   -- 100명 × 3
    target_reactions                       = 500,   -- 100명 × 5
    target_votes                           = 300,   -- 100명 × 3
    target_comment_participation           = 30.0,
    target_reaction_participation          = 50.0,
    target_vote_participation              = 30.0,
    target_daily_new_users                 = 3.3,   -- 100명 / 30일
    target_daily_comments                  = 10.0,  -- 300 / 30일
    target_daily_reactions                 = 16.7,  -- 500 / 30일
    target_daily_issues                    = 3,
    target_daily_shortforms_per_platform   = 3,
    notes = '6월 목표: 신규 가입자 100명, 댓글 300개(×3), 반응 500개(×5), 이슈 일 3개, 숏폼 플랫폼별 일 3개'
WHERE period_year = 2026 AND period_month = 6;

-- 3. 주차별 마일스톤 업데이트 (100명 기준)
UPDATE kpi_milestones SET target_users = 40,  target_comments = 75
WHERE goal_id = (SELECT id FROM kpi_goals WHERE period_year = 2026 AND period_month = 6)
  AND week_number = 1;

UPDATE kpi_milestones SET target_users = 60,  target_comments = 150
WHERE goal_id = (SELECT id FROM kpi_goals WHERE period_year = 2026 AND period_month = 6)
  AND week_number = 2;

UPDATE kpi_milestones SET target_users = 80,  target_comments = 225
WHERE goal_id = (SELECT id FROM kpi_goals WHERE period_year = 2026 AND period_month = 6)
  AND week_number = 3;

UPDATE kpi_milestones SET target_users = 100, target_comments = 300
WHERE goal_id = (SELECT id FROM kpi_goals WHERE period_year = 2026 AND period_month = 6)
  AND week_number = 4;
