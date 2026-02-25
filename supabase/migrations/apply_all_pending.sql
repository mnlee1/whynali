-- ============================================================
-- 미적용 마이그레이션 통합 실행 파일
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- 모든 구문에 IF NOT EXISTS 가드 적용 → 이미 적용된 경우 무해하게 건너뜀
-- ============================================================

-- 1. news_data: category 컬럼 추가
--    뉴스 수집 시 카테고리 저장 → 이슈-뉴스 매칭 카테고리 필터 동작 조건
ALTER TABLE news_data
    ADD COLUMN IF NOT EXISTS category TEXT
        CHECK (category IN ('연예', '스포츠', '정치', '사회', '기술'));

CREATE INDEX IF NOT EXISTS idx_news_data_category ON news_data(category);

-- 2. issues: visibility_status 컬럼 추가
--    이슈 목록 조회 API에서 .eq('visibility_status', 'visible') 필터 동작 조건
--    미적용 시 이슈 목록 API 전체가 에러 반환 → 카테고리 페이지 빈 화면
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(20) NOT NULL DEFAULT 'visible';

COMMENT ON COLUMN issues.visibility_status IS '노출 여부: visible(기본), hidden(숨김 처리된 승인 이슈)';

-- 3. comment_likes 테이블 생성 + timeline_points.title 컬럼 추가
--    timeline_points.title 없으면 타임라인 API select 에러 → 타임라인 미표시
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

ALTER TABLE timeline_points ADD COLUMN IF NOT EXISTS title TEXT;

-- 4. news_data / community_data: UNIQUE 제약 추가 (중복 수집 방지)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'news_data_link_unique'
    ) THEN
        ALTER TABLE news_data ADD CONSTRAINT news_data_link_unique UNIQUE (link);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'community_data_url_unique'
    ) THEN
        ALTER TABLE community_data ADD CONSTRAINT community_data_url_unique UNIQUE (url);
    END IF;
END $$;

-- 5. api_usage: success_count / fail_count 컬럼 추가
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;

UPDATE api_usage SET success_count = call_count WHERE success_count = 0;

-- 6. admin_logs: details 컬럼 추가
ALTER TABLE admin_logs
    ADD COLUMN IF NOT EXISTS details TEXT;

-- 7. 투표 원자 처리 함수 (CREATE OR REPLACE → 이미 있어도 안전)
CREATE OR REPLACE FUNCTION vote_participate(
    p_vote_id       uuid,
    p_choice_id     uuid,
    p_user_id       uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM votes WHERE id = p_vote_id AND phase = '진행중'
    ) THEN
        RAISE EXCEPTION 'VOTE_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM vote_choices WHERE id = p_choice_id AND vote_id = p_vote_id
    ) THEN
        RAISE EXCEPTION 'INVALID_CHOICE' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO user_votes (vote_id, vote_choice_id, user_id)
    VALUES (p_vote_id, p_choice_id, p_user_id);

    UPDATE vote_choices
    SET count = count + 1
    WHERE id = p_choice_id;
END;
$$;

CREATE OR REPLACE FUNCTION vote_cancel(
    p_vote_id   uuid,
    p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_choice_id uuid;
BEGIN
    SELECT vote_choice_id INTO v_choice_id
    FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    IF v_choice_id IS NULL THEN
        RAISE EXCEPTION 'VOTE_NOT_FOUND' USING ERRCODE = 'P0004';
    END IF;

    DELETE FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    UPDATE vote_choices
    SET count = GREATEST(count - 1, 0)
    WHERE id = v_choice_id;
END;
$$;
