-- comment_reports: 댓글/토론 의견 신고 테이블
--
-- comments 테이블이 이슈 댓글(issue_id)과 토론 의견(discussion_topic_id)을 모두 처리하므로
-- 단일 테이블로 두 유형의 신고를 커버한다.
--
-- 알림 트리거 조건:
--   - report_count >= 2 에 처음 도달한 시점
--   - 또는 사유 = '욕설/혐오' (신고 1건이어도 즉시)

CREATE TABLE comment_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason      TEXT NOT NULL CHECK (reason IN ('욕설/혐오', '스팸', '허위정보', '기타')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (comment_id, reporter_id)   -- 동일 유저 중복 신고 방지
);

-- 신고 조회 성능용 인덱스
CREATE INDEX idx_comment_reports_comment_id ON comment_reports(comment_id);
