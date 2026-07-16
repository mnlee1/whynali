-- add_naver_blog_tags_column.sql
-- 네이버 블로그 마케팅 최적화: AI가 생성한 추천 태그 저장 (관리자가 복사해 네이버 에디터 태그란에 입력)

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS blog_post_tags text[];
