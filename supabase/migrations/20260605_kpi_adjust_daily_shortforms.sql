-- 플랫폼별 일일 숏폼 목표 3 → 2 조정

UPDATE kpi_goals SET
    target_daily_shortforms_per_platform = 2,
    notes = '6월 목표: 신규 가입자 100명, 댓글 300개(×3), 반응 500개(×5), 이슈 일 2개, 숏폼 플랫폼별 일 2개'
WHERE period_year = 2026 AND period_month = 6;
