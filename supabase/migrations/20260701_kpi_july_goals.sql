-- 7월 KPI 목표 설정
-- 기준: 6월 목표와 동일하게 유지
-- 시작 가입자: 23명 (2026-07-01 기준)

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
    target_daily_issues,
    target_daily_shortforms_per_platform,
    notes,
    is_active
) VALUES (
    2026,
    7,
    '2026-07-01',
    '2026-07-31',
    100,
    20,
    300,
    500,
    300,
    30.0,
    50.0,
    30.0,
    3.3,
    10.0,
    16.7,
    2,
    1,
    '7월 목표: 6월 목표와 동일 유지. 시작 23명 → 목표 100명. 이슈 승인 일 2개, 숏폼 일 1개',
    true
) ON CONFLICT (period_year, period_month) DO UPDATE SET
    period_start                         = EXCLUDED.period_start,
    period_end                           = EXCLUDED.period_end,
    target_users                         = EXCLUDED.target_users,
    target_active_issues                 = EXCLUDED.target_active_issues,
    target_comments                      = EXCLUDED.target_comments,
    target_reactions                     = EXCLUDED.target_reactions,
    target_votes                         = EXCLUDED.target_votes,
    target_comment_participation         = EXCLUDED.target_comment_participation,
    target_reaction_participation        = EXCLUDED.target_reaction_participation,
    target_vote_participation            = EXCLUDED.target_vote_participation,
    target_daily_new_users               = EXCLUDED.target_daily_new_users,
    target_daily_comments                = EXCLUDED.target_daily_comments,
    target_daily_reactions               = EXCLUDED.target_daily_reactions,
    target_daily_issues                  = EXCLUDED.target_daily_issues,
    target_daily_shortforms_per_platform = EXCLUDED.target_daily_shortforms_per_platform,
    notes                                = EXCLUDED.notes,
    updated_at                           = NOW();

-- 주차별 마일스톤 (23명 시작 → 100명 목표)
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
        (1, '2026-07-01', '2026-07-07',  40,  75),
        (2, '2026-07-08', '2026-07-14',  60, 150),
        (3, '2026-07-15', '2026-07-21',  80, 225),
        (4, '2026-07-22', '2026-07-31', 100, 300)
) AS w(week_number, start_date, end_date, target_users, target_comments)
WHERE g.period_year = 2026 AND g.period_month = 7
ON CONFLICT (goal_id, week_number) DO UPDATE SET
    start_date     = EXCLUDED.start_date,
    end_date       = EXCLUDED.end_date,
    target_users   = EXCLUDED.target_users,
    target_comments = EXCLUDED.target_comments;
