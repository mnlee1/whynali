-- timeline_summaries 테이블 구조 변경: summary → bullets (JSONB)
-- ChatGPT 스타일의 bullet points 지원

-- 1. 새 컬럼 추가
ALTER TABLE timeline_summaries ADD COLUMN IF NOT EXISTS bullets jsonb;

-- 2. 기존 summary 데이터를 bullets 배열로 마이그레이션
-- summary가 있으면 배열로 감싸서 bullets에 저장
UPDATE timeline_summaries
SET bullets = jsonb_build_array(summary)
WHERE bullets IS NULL AND summary IS NOT NULL AND summary != '';

-- 3. summary 컬럼을 nullable로 변경 (향후 제거 예정)
ALTER TABLE timeline_summaries ALTER COLUMN summary DROP NOT NULL;

-- 4. bullets 컬럼을 NOT NULL로 변경 (기본값 설정)
ALTER TABLE timeline_summaries ALTER COLUMN bullets SET DEFAULT '[]'::jsonb;
UPDATE timeline_summaries SET bullets = '[]'::jsonb WHERE bullets IS NULL;
ALTER TABLE timeline_summaries ALTER COLUMN bullets SET NOT NULL;

-- 참고: summary 컬럼은 호환성을 위해 일단 유지
-- 향후 모든 데이터가 bullets로 마이그레이션되면 DROP할 예정
