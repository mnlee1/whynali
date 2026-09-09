-- 큐레이션 관심(팔로우) 테이블
-- 홈 "추천 큐레이션" 위젯의 "+관심" 버튼에서 사용.
-- 큐레이션은 아직 별도 테이블 없이 category/heat_index 조합으로 즉석 계산되므로,
-- curation_key로 어떤 큐레이션인지 식별한다 (예: 'recommend:hot', 'recommend:discussion').
-- 추후 마이페이지 개인화 작업 시 이 테이블을 그대로 조회해 "관심 큐레이션" 목록을 구성한다.

CREATE TABLE IF NOT EXISTS curation_follows (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    curation_key  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, curation_key)
);

CREATE INDEX IF NOT EXISTS idx_curation_follows_user_id ON curation_follows(user_id);
