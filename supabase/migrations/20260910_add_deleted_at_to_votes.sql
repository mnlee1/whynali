-- 투표 소프트 삭제용 컬럼 추가
-- approval_status는 '대기/승인/반려'만 허용하는 CHECK 제약이 있어 삭제 상태를
-- 표현할 수 없으므로, 별도 컬럼으로 삭제 여부를 관리한다.
-- deleted_at이 NULL이 아니면 삭제된 것으로 간주하고 조회에서 제외한다.
ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_votes_deleted_at ON votes (deleted_at) WHERE deleted_at IS NULL;
