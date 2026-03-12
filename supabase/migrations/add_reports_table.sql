-- 댓글 신고 테이블
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IN ('욕설/혐오', '스팸/광고', '허위정보', '기타')) NOT NULL,
    status TEXT CHECK (status IN ('대기', '처리완료', '무시')) DEFAULT '대기',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)
);

-- 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_comment_id ON reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
