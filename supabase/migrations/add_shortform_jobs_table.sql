-- supabase/migrations/add_shortform_jobs_table.sql
--
-- shortform_jobs 테이블 생성
--
-- 숏폼 자동 생성·배포 파이프라인용 작업 테이블.
-- 이슈 생성 또는 상태 전환 시 트리거되며, 영상 생성 및 플랫폼 업로드 상태를 추적한다.
-- 본문 요약은 절대 사용하지 않으며, 이슈 메타데이터(제목, 상태, 화력, 출처 수, URL)만 사용한다.

CREATE TABLE IF NOT EXISTS shortform_jobs (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

    -- 대상 이슈 정보
    issue_id            uuid        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

    -- 생성 시점 이슈 스냅샷 (영상 생성용 메타데이터)
    issue_title         text        NOT NULL,
    issue_status        text        NOT NULL CHECK (issue_status IN ('점화', '논란중', '종결')),
    heat_grade          text        NOT NULL CHECK (heat_grade IN ('높음', '보통', '낮음')),
    source_count        jsonb       NOT NULL,  -- { news: number, community: number }
    issue_url           text        NOT NULL,  -- https://whynali.com/issue/{id}

    -- 영상 생성 결과
    video_path          text,                  -- 생성된 영상 파일 경로 (nullable)

    -- 승인 상태 (어드민 검토)
    approval_status     text        NOT NULL DEFAULT 'pending'
                                    CHECK (approval_status IN ('pending', 'approved', 'rejected')),

    -- 플랫폼별 업로드 상태
    upload_status       jsonb,                 -- { youtube?: 'done'|'failed', instagram?: ..., tiktok?: ... }

    -- 트리거 구분
    trigger_type        text        NOT NULL CHECK (trigger_type IN ('issue_created', 'status_changed')),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 이슈별 작업 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_shortform_jobs_issue_id
    ON shortform_jobs (issue_id, created_at DESC);

-- 승인 대기 작업 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_shortform_jobs_approval_status
    ON shortform_jobs (approval_status, created_at DESC);

-- 트리거 타입별 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_shortform_jobs_trigger_type
    ON shortform_jobs (trigger_type, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_shortform_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shortform_jobs_updated_at ON shortform_jobs;
CREATE TRIGGER trg_shortform_jobs_updated_at
    BEFORE UPDATE ON shortform_jobs
    FOR EACH ROW EXECUTE FUNCTION update_shortform_jobs_updated_at();

-- RLS 활성화 (어드민 전용 테이블)
ALTER TABLE shortform_jobs ENABLE ROW LEVEL SECURITY;

-- 기본 정책: 모든 접근 차단 (어드민은 서비스 역할 키로 우회)
CREATE POLICY shortform_jobs_no_access ON shortform_jobs
    FOR ALL
    USING (false);

COMMENT ON TABLE shortform_jobs IS '숏폼 자동 생성·배포 작업 테이블 (어드민 전용)';
COMMENT ON COLUMN shortform_jobs.issue_title IS '생성 시점 이슈 제목 스냅샷';
COMMENT ON COLUMN shortform_jobs.source_count IS '뉴스/커뮤니티 출처 개수 (JSONB)';
COMMENT ON COLUMN shortform_jobs.video_path IS '생성된 영상 파일 경로';
COMMENT ON COLUMN shortform_jobs.approval_status IS '어드민 승인 상태: pending(대기) | approved(승인) | rejected(반려)';
COMMENT ON COLUMN shortform_jobs.upload_status IS '플랫폼별 업로드 상태 (JSONB)';
COMMENT ON COLUMN shortform_jobs.trigger_type IS '작업 트리거 구분: issue_created(이슈 생성) | status_changed(상태 전환)';
