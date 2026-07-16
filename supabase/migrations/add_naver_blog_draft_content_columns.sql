-- add_naver_blog_draft_content_columns.sql
-- 네이버 블로그 글쓰기 API가 2020년 폐지되어 자동 발행이 불가능함이 확인됨.
-- AI가 생성한 초안(제목/본문)을 저장해 관리자가 직접 복사해 게시하는 방식으로 전환.

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS blog_post_title text,
    ADD COLUMN IF NOT EXISTS blog_post_content text;
