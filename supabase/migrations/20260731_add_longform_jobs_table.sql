-- 20260731_add_longform_jobs_table.sql
--
-- 옴니버스형 롱폼(기존 완료된 숏폼 여러 개를 이어붙인 영상) 작업 관리 테이블.
-- shortform_jobs와 동일한 원칙: 최종 결과물(video_path)만 저장하고,
-- 훅 문장/강조 단어/씬 구성 등은 생성 API 호출 시점의 요청 바디로만 전달되는 휘발성 데이터로 둠.

CREATE TABLE IF NOT EXISTS longform_jobs (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    source_job_ids      uuid[]      NOT NULL,
    source_titles       text[]      NOT NULL,
    video_path          text,
    approval_status     text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    upload_status       jsonb,
    approved_at         timestamptz,
    youtube_uploaded_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_longform_jobs_created_at ON longform_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_longform_jobs_approval_status ON longform_jobs (approval_status);

COMMENT ON TABLE longform_jobs IS '옴니버스형 롱폼(완료된 숏폼 여러 개를 이어붙인 영상) 작업 관리 테이블';
COMMENT ON COLUMN longform_jobs.source_job_ids IS '이 롱폼에 포함된 shortform_jobs.id 배열 (배열 순서 = 영상 내 이슈 등장 순서, 첫 번째가 훅 대상)';
COMMENT ON COLUMN longform_jobs.source_titles IS 'source_job_ids에 대응하는 이슈 제목 배열 (admin 목록 표시용 비정규화 캐시)';
COMMENT ON COLUMN longform_jobs.video_path IS '최종 렌더링된 mp4의 Supabase Storage 경로 (nullable — 생성 전에는 job 레코드만 존재)';
