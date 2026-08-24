-- 북마크(관심 이슈 등록) 테이블
-- 이슈 상세 좌측 액션 레일의 "북마크" 버튼에서 사용.
-- 개인화 저장 + 추후 "북마크한 이슈 알림" 기능의 대상 목록으로 활용 예정.

CREATE TABLE IF NOT EXISTS bookmarks (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(issue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_issue_id ON bookmarks(issue_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
