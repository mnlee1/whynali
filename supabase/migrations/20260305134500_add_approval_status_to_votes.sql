-- supabase/migrations/20260305134500_add_approval_status_to_votes.sql
--
-- 투표 테이블에 approval_status 필드 추가
-- 반려와 삭제를 구분하기 위함
--
-- phase: 대기 | 진행중 | 마감 (투표 진행 상태)
-- approval_status: 대기 | 승인 | 반려 (관리자 검토 상태)

-- 1. 필드 추가
ALTER TABLE votes ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT '대기';

-- 2. 체크 제약 조건
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_approval_status_check;
ALTER TABLE votes ADD CONSTRAINT votes_approval_status_check 
    CHECK (approval_status IN ('대기', '승인', '반려'));

-- 3. 기존 데이터 마이그레이션
-- phase='대기' → approval_status='대기'
-- phase='진행중' 또는 '마감' → approval_status='승인'
UPDATE votes 
SET approval_status = CASE 
    WHEN phase = '대기' THEN '대기'
    ELSE '승인'
END
WHERE approval_status IS NULL OR approval_status = '대기';

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_votes_approval_status ON votes(approval_status);

-- 5. 코멘트
COMMENT ON COLUMN votes.approval_status IS '관리자 검토 상태. 대기=검토 전, 승인=사용자 노출, 반려=거부됨(삭제 전)';
