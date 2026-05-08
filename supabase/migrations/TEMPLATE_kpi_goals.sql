-- KPI 목표 설정 템플릿
-- 매월 이 파일을 복사해서 값만 수정 후 Supabase에서 실행하세요

-- ============================================
-- 📝 설정할 값들 (아래 값만 수정하세요)
-- ============================================

-- 기간 설정
-- 예: 2026년 7월 목표라면
--   period_year: 2026
--   period_month: 7
--   period_start: '2026-07-01'
--   period_end: '2026-07-31'

INSERT INTO kpi_goals (
    period_year,                    -- 연도 (예: 2026)
    period_month,                   -- 월 (예: 7)
    period_start,                   -- 시작일 (예: '2026-07-01')
    period_end,                     -- 종료일 (예: '2026-07-31')
    
    -- 최종 목표 (월말 기준)
    target_users,                   -- 목표 가입자 수 (예: 100)
    target_active_issues,           -- 목표 활성 이슈 수 (예: 20)
    target_comments,                -- 목표 누적 댓글 수 (예: 150)
    target_reactions,               -- 목표 누적 반응 수 (예: 300)
    target_votes,                   -- 목표 누적 투표 수 (예: 200)
    
    -- 참여율 목표 (%)
    target_comment_participation,   -- 댓글 참여율 (예: 25.0)
    target_reaction_participation,  -- 반응 참여율 (예: 50.0)
    target_vote_participation,      -- 투표 참여율 (예: 20.0)
    
    -- 일평균 목표
    target_daily_new_users,         -- 일평균 신규 가입 (예: 1.5)
    target_daily_comments,          -- 일평균 댓글 (예: 3.0)
    target_daily_reactions,         -- 일평균 반응 (예: 5.0)
    
    -- 메모 (선택사항)
    notes,                          -- 목표 설명 (예: '7월 목표: 2배 성장, 주간 30% 성장률')
    is_active                       -- 활성화 여부 (true)
) VALUES (
    2026,                           -- ← 연도 수정
    7,                              -- ← 월 수정
    '2026-07-01',                   -- ← 시작일 수정
    '2026-07-31',                   -- ← 종료일 수정
    
    100,                            -- ← 목표 가입자 수정
    20,                             -- ← 목표 활성 이슈 수정
    150,                            -- ← 목표 댓글 수정
    300,                            -- ← 목표 반응 수정
    200,                            -- ← 목표 투표 수정
    
    25.0,                           -- ← 댓글 참여율 수정
    50.0,                           -- ← 반응 참여율 수정
    20.0,                           -- ← 투표 참여율 수정
    
    1.5,                            -- ← 일평균 신규 가입 수정
    3.0,                            -- ← 일평균 댓글 수정
    5.0,                            -- ← 일평균 반응 수정
    
    '7월 목표: 2배 성장 목표',     -- ← 메모 수정 (선택)
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

-- ============================================
-- 📅 주차별 마일스톤 설정
-- ============================================

-- 주차 구분 예시 (7월 = 4-5주)
--   1주차: 7/1 - 7/7
--   2주차: 7/8 - 7/14
--   3주차: 7/15 - 7/21
--   4주차: 7/22 - 7/28
--   5주차: 7/29 - 7/31 (선택)

-- 주차별 목표는 최종 목표를 기준으로 선형 증가로 계산하거나
-- 성장률을 고려해서 계산하세요

-- 간단한 계산 예시:
-- 시작: 현재 50명
-- 목표: 100명 (50명 증가)
-- 4주 → 주당 12-13명 증가
--   1주차: 62명
--   2주차: 75명
--   3주차: 88명
--   4주차: 100명

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
        -- week_number, start_date, end_date, target_users, target_comments
        (1, '2026-07-01', '2026-07-07', 62, 40),      -- ← 1주차 목표 수정
        (2, '2026-07-08', '2026-07-14', 75, 70),      -- ← 2주차 목표 수정
        (3, '2026-07-15', '2026-07-21', 88, 110),     -- ← 3주차 목표 수정
        (4, '2026-07-22', '2026-07-31', 100, 150)     -- ← 4주차 목표 수정 (마지막 주)
        -- 5주차가 필요하면 추가
        -- (5, '2026-07-29', '2026-07-31', 100, 150)
) AS w(week_number, start_date, end_date, target_users, target_comments)
WHERE g.period_year = 2026 AND g.period_month = 7     -- ← 연도/월 수정
ON CONFLICT (goal_id, week_number) DO UPDATE SET
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    target_users = EXCLUDED.target_users,
    target_comments = EXCLUDED.target_comments;

-- ============================================
-- ✅ 완료!
-- ============================================
-- 이제 Supabase SQL Editor에서 실행하면 됩니다.
-- KPI 대시보드에서 해당 월을 선택하면 목표가 표시됩니다.
