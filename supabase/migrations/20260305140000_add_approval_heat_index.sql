/**
 * 승인 당시 화력 지수 저장
 * 
 * 자동 승인/반려 시 당시 화력을 저장하여
 * 관리자가 승인 근거를 확인할 수 있도록 함
 */

-- approval_heat_index 컬럼 추가
ALTER TABLE issues
ADD COLUMN approval_heat_index INTEGER;

-- 컬럼 설명
COMMENT ON COLUMN issues.approval_heat_index IS '승인/반려 당시 화력 지수 (자동 승인/반려 근거)';
