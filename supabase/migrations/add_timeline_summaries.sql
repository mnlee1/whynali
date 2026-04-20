-- timeline_summaries: 이슈별 AI 타임라인 요약 캐시
-- update-timeline cron이 새 포인트 추가 후 생성/갱신
-- 유저 요청 시에는 이 테이블만 읽음 (Groq 호출 없음)

CREATE TABLE IF NOT EXISTS timeline_summaries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    stage text NOT NULL CHECK (stage IN ('발단', '전개', '파생', '진정')),
    stage_title text NOT NULL,
    summary text NOT NULL,
    date_start timestamptz NOT NULL,
    date_end timestamptz NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (issue_id, stage)
);

CREATE INDEX IF NOT EXISTS timeline_summaries_issue_id_idx ON timeline_summaries(issue_id);
