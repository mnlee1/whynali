-- kpi_goals notes 가독성 개선

UPDATE kpi_goals SET
    notes = '가입자 100명 · 이슈 일 2개 · 숏폼 플랫폼별 일 2개 · 댓글 300개(가입자×3) · 반응 500개(가입자×5) · 익월 +20%'
WHERE period_year = 2026 AND period_month = 6;
