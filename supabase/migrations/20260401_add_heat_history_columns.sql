/**
 * 20260401_add_heat_history_columns.sql
 *
 * 급상승 이슈 추적을 위한 화력 히스토리 컬럼 추가
 * - heat_index_1h_ago: 1시간 전 화력 지수
 * - heat_updated_at: 화력 업데이트 시각
 *
 * 용도: 메인 페이지에서 "급상승 중" 이슈 리스트 제공
 */

-- heat_index_1h_ago 컬럼 추가
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS heat_index_1h_ago NUMERIC;

-- heat_updated_at 컬럼 추가
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS heat_updated_at TIMESTAMPTZ;

-- 컬럼 설명
COMMENT ON COLUMN issues.heat_index_1h_ago IS '1시간 전 화력 지수 (급상승 계산용)';
COMMENT ON COLUMN issues.heat_updated_at IS '화력 지수 마지막 업데이트 시각';

-- 기존 이슈에 초기값 설정
UPDATE issues
SET heat_index_1h_ago = heat_index,
    heat_updated_at = NOW()
WHERE heat_index_1h_ago IS NULL;
