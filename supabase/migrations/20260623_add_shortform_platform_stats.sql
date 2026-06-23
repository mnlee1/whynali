-- shortform_jobs 테이블에 플랫폼별 성과 지표 컬럼 추가
-- 업로드 후 YouTube / Instagram / TikTok API로 수집한 조회수·좋아요 등을 저장

ALTER TABLE shortform_jobs
    ADD COLUMN IF NOT EXISTS platform_stats jsonb DEFAULT '{}' NOT NULL;

COMMENT ON COLUMN shortform_jobs.platform_stats IS
    '플랫폼별 성과 지표. 예: {"youtube":{"views":4200,"likes":310,"comments":12,"fetched_at":"2026-06-23T..."},"instagram":{"plays":7800,"likes":450,"fetched_at":"..."},"tiktok":{"views":12400,"likes":890,"fetched_at":"..."}}';
