-- 일일 신규 이슈 목표 3 → 2 조정
-- 등록 2-3개 중 승인 가능한 건이 1-2개 수준이므로 현실적인 수치로 변경

UPDATE kpi_goals SET
    target_daily_issues = 2,
    notes = '6월 목표: 신규 가입자 100명, 댓글 300개(×3), 반응 500개(×5), 이슈 일 2개, 숏폼 플랫폼별 일 3개'
WHERE period_year = 2026 AND period_month = 6;
