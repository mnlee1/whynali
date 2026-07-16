-- add_naver_blog_auto_post_columns.sql
-- 네이버 블로그 자동 포스팅: 점화→논란중 전환 시점에 예약 발행하기 위한 상태 컬럼

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS blog_post_status text,
    ADD COLUMN IF NOT EXISTS blog_scheduled_at timestamptz,
    ADD COLUMN IF NOT EXISTS blog_posted_at timestamptz,
    ADD COLUMN IF NOT EXISTS blog_post_url text,
    ADD COLUMN IF NOT EXISTS blog_post_error text,
    ADD COLUMN IF NOT EXISTS blog_post_retry_count int NOT NULL DEFAULT 0;

-- generate-naver-blog-draft 크론이 발행 대상 조회 시 사용
CREATE INDEX IF NOT EXISTS idx_issues_blog_post_pending
    ON issues (blog_scheduled_at)
    WHERE blog_post_status = 'pending';
