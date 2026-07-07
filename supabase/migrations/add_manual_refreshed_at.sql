-- add_manual_refreshed_at.sql
-- 수동 등록 이슈 재수집 Cron(refresh-manual-issues)이 마지막으로 처리한 시각을 기록.
-- 재수집 배치를 가장 오래 방치된 이슈부터 순회시키는 데 사용한다.

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS manual_refreshed_at TIMESTAMPTZ;
