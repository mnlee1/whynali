-- ============================================================
-- 마이그레이션: 댓글 좋아요/싫어요 테이블 + 타임라인 title 컬럼
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ============================================================

-- 1. 댓글 좋아요/싫어요 기록 테이블
--    사용자별 1회 (UNIQUE comment_id, user_id), like/dislike 중 하나만 허용
CREATE TABLE IF NOT EXISTS comment_likes (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id  uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL,
    type        TEXT        NOT NULL CHECK (type IN ('like', 'dislike')),
    created_at  timestamptz DEFAULT now(),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id    ON comment_likes(user_id);

-- 2. timeline_points 에 이벤트 설명 컬럼 추가
--    관리자가 타임라인 포인트 등록 시 한 줄 요약을 입력하는 용도
ALTER TABLE timeline_points ADD COLUMN IF NOT EXISTS title TEXT;
