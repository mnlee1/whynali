-- ========================================
-- 이슈 병합 기능 DB 마이그레이션
-- 실행: Supabase Dashboard → SQL Editor
-- ========================================

-- 1. merged_into_id 컬럼 추가 (먼저!)
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES issues(id) ON DELETE SET NULL;

-- 2. approval_status에 '병합됨' 추가
ALTER TABLE issues
DROP CONSTRAINT IF EXISTS issues_approval_status_check;

ALTER TABLE issues
ADD CONSTRAINT issues_approval_status_check
CHECK (approval_status IN ('대기', '승인', '반려', '병합됨'));

-- 3. 병합된 이슈 인덱스
CREATE INDEX IF NOT EXISTS idx_issues_merged_into 
ON issues(merged_into_id)
WHERE merged_into_id IS NOT NULL;

-- 3. 제목 중복 방지 (대기/승인 상태만)
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_unique_title_active
ON issues(title)
WHERE approval_status IN ('대기', '승인');

-- 4. 주석 추가
COMMENT ON COLUMN issues.merged_into_id IS '병합된 대상 이슈 ID (병합됨 상태일 때만)';
COMMENT ON INDEX idx_issues_unique_title_active IS '대기/승인 상태 이슈의 제목 중복 방지';

-- ========================================
-- 검증 쿼리
-- ========================================

-- merged_into_id 컬럼 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'issues'
AND column_name = 'merged_into_id';

-- approval_status 제약 확인
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'issues'::regclass
AND conname LIKE '%approval_status%';

-- 인덱스 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'issues'
AND indexname IN ('idx_issues_merged_into', 'idx_issues_unique_title_active');
