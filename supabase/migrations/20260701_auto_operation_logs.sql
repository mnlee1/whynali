-- 자동 운영 로그 테이블
-- 크론/봇 등 자동화 작업 실행 내역 기록
CREATE TABLE IF NOT EXISTS auto_operation_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type    TEXT        NOT NULL,   -- 'bot_comment', 'bot_comment_batch', ...
    status      TEXT        NOT NULL,   -- 'success', 'failed', 'skipped'
    target_type TEXT,                   -- 'issue', etc.
    target_id   UUID,
    details     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_op_logs_created_at ON auto_operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_op_logs_job_type   ON auto_operation_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_auto_op_logs_status     ON auto_operation_logs(status);

ALTER TABLE auto_operation_logs ENABLE ROW LEVEL SECURITY;
-- service_role 은 RLS 우회 → supabaseAdmin으로만 기록
