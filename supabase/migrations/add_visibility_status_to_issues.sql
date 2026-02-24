-- supabase/migrations/add_visibility_status_to_issues.sql
--
-- 이슈 숨김/반려 상태 모델 분리
--
-- 기존: hide와 reject 모두 approval_status='반려'로 처리 → 구분 불가
-- 개선:
--   approval_status: 검수 결과 (대기 | 승인 | 반려) - reject만 영향
--   visibility_status: 노출 여부 (visible | hidden) - hide만 영향
--
-- 공개 이슈 조회 조건:
--   approval_status = '승인' AND visibility_status = 'visible'

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(20) NOT NULL DEFAULT 'visible';

-- 기존 hide 처리 데이터 식별 불가로 일괄 visible 처리 (운영 시 수동 정리 필요)
COMMENT ON COLUMN issues.visibility_status IS '노출 여부: visible(기본), hidden(숨김 처리된 승인 이슈)';
