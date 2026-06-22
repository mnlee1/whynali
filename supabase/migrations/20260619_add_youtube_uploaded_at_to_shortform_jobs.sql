-- supabase/migrations/20260619_add_youtube_uploaded_at_to_shortform_jobs.sql
--
-- shortform_jobs에 youtube_uploaded_at 컬럼 추가
--
-- KPI "숏폼 등록" 카운트 기준.
-- YouTube 업로드 성공 시 기록하며, 인스타/틱톡은 팀원이 수동 업로드하므로
-- YouTube 1건 = 숏폼 1건 배포로 간주한다.

ALTER TABLE shortform_jobs
    ADD COLUMN IF NOT EXISTS youtube_uploaded_at timestamptz;

-- 기존 YouTube 업로드 완료 행 소급 적용 (JSONB 내 uploaded_at 추출)
UPDATE shortform_jobs
    SET youtube_uploaded_at = (upload_status -> 'youtube' ->> 'uploaded_at')::timestamptz
    WHERE upload_status -> 'youtube' ->> 'status' = 'success'
      AND youtube_uploaded_at IS NULL;

COMMENT ON COLUMN shortform_jobs.youtube_uploaded_at IS 'YouTube Shorts 업로드 완료 시각 — KPI 숏폼 등록 카운트 기준 (NULL이면 미업로드)';
