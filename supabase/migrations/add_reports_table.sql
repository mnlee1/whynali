-- =====================================================
-- reports 테이블 생성
-- =====================================================
-- 
-- 사용법: Supabase Dashboard > SQL Editor에서 실행
-- 또는: supabase db push (로컬 개발 환경)
--
-- 이 마이그레이션은 댓글 신고 기능을 위한 reports 테이블을 생성합니다.
-- - 사용자가 댓글을 신고하면 reports 테이블에 기록됩니다.
-- - 관리자는 /admin/safety 페이지에서 신고를 처리할 수 있습니다.
-- - UNIQUE(comment_id, reporter_id)로 중복 신고를 방지합니다.
--
-- =====================================================

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IN ('욕설/혐오', '스팸/광고', '허위정보', '기타')) NOT NULL,
    status TEXT CHECK (status IN ('대기', '처리완료', '무시')) DEFAULT '대기',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_reports_comment_id ON reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- 코멘트 추가
COMMENT ON TABLE reports IS '댓글 신고 기록';
COMMENT ON COLUMN reports.comment_id IS '신고 대상 댓글 ID';
COMMENT ON COLUMN reports.reporter_id IS '신고자 user ID';
COMMENT ON COLUMN reports.reason IS '신고 사유: 욕설/혐오 | 스팸/광고 | 허위정보 | 기타';
COMMENT ON COLUMN reports.status IS '처리 상태: 대기 | 처리완료 | 무시';
