-- 토론 주제 상태 단순화: 대기/승인/반려/종료 → 대기/진행중/마감

-- 1. 기존 데이터 매핑
UPDATE discussion_topics SET approval_status = '진행중' WHERE approval_status = '승인';
UPDATE discussion_topics SET approval_status = '마감' WHERE approval_status = '종료';
-- 반려 상태는 삭제하거나 대기로 변경 (선택)
-- DELETE FROM discussion_topics WHERE approval_status = '반려';
UPDATE discussion_topics SET approval_status = '대기' WHERE approval_status = '반려';

-- 2. 기존 제약조건 삭제 (있다면)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'discussion_topics_approval_status_check'
    ) THEN
        ALTER TABLE discussion_topics DROP CONSTRAINT discussion_topics_approval_status_check;
    END IF;
END $$;

-- 3. 새로운 제약조건 추가
ALTER TABLE discussion_topics 
ADD CONSTRAINT discussion_topics_approval_status_check 
CHECK (approval_status IN ('대기', '진행중', '마감'));

-- 4. 코멘트 업데이트
COMMENT ON COLUMN discussion_topics.approval_status IS '토론 상태: 대기(승인 대기), 진행중(공개 및 토론 가능), 마감(토론 종료)';
