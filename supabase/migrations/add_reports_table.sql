CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IN ('스팸', '욕설/혐오', '허위정보', '기타')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT CHECK (status IN ('대기', '처리완료', '무시')) DEFAULT '대기',
    UNIQUE(comment_id, reporter_id)
);

CREATE INDEX idx_reports_comment_id ON reports(comment_id);
CREATE INDEX idx_reports_status ON reports(status);
