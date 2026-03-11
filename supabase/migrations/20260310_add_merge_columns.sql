-- 이슈 병합 기능을 위한 컬럼 추가
-- 병합된 이슈는 approval_status='병합됨'으로 변경되고
-- merged_into_id에 병합된 대상 이슈 ID를 저장

ALTER TABLE issues
ADD COLUMN merged_into_id UUID REFERENCES issues(id) ON DELETE SET NULL;

-- 인덱스 추가 (병합된 이슈 조회 성능 향상)
CREATE INDEX idx_issues_merged_into ON issues(merged_into_id)
WHERE merged_into_id IS NOT NULL;

-- approval_status에 '병합됨' 추가 (이미 있을 수 있음)
ALTER TABLE issues
DROP CONSTRAINT IF EXISTS issues_approval_status_check;

ALTER TABLE issues
ADD CONSTRAINT issues_approval_status_check
CHECK (approval_status IN ('대기', '승인', '반려', '병합됨'));

-- 제목 중복 방지 인덱스 추가
-- (대기 또는 승인 상태에서만 같은 제목 허용 안 함)
CREATE UNIQUE INDEX idx_issues_unique_title_active
ON issues(title)
WHERE approval_status IN ('대기', '승인');

COMMENT ON COLUMN issues.merged_into_id IS '병합된 대상 이슈 ID (병합됨 상태일 때만)';
COMMENT ON INDEX idx_issues_unique_title_active IS '대기/승인 상태 이슈의 제목 중복 방지';
