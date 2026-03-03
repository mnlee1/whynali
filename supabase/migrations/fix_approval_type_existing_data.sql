-- 기존 데이터의 approval_type을 정리
-- 기존에 모두 'manual'로 설정했던 것을 다시 null로 초기화
-- 실제로 관리자가 승인/반려한 것인지 알 수 없으므로 null로 두는 것이 안전

-- 기존 승인된 이슈의 approval_type을 null로 초기화
UPDATE issues 
SET approval_type = NULL 
WHERE approval_status = '승인' AND approval_type = 'manual';

-- 기존 반려된 이슈의 approval_type을 null로 초기화
UPDATE issues 
SET approval_type = NULL 
WHERE approval_status = '반려';

-- 대기 상태 이슈는 이미 null이므로 변경 불필요
