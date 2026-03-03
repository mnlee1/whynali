-- issues 테이블에 approval_type 필드 추가
-- 자동 승인(auto)과 수동 승인(manual)을 구분하기 위한 필드

ALTER TABLE issues 
ADD COLUMN approval_type TEXT CHECK (approval_type IN ('auto', 'manual'));

-- 기존 승인된 이슈들은 수동 승인으로 처리
UPDATE issues 
SET approval_type = 'manual' 
WHERE approval_status = '승인';

-- 대기 상태 이슈는 null 유지 (승인되면 그때 설정됨)
