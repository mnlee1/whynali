-- issues 테이블에 브리핑 요약 컬럼 추가
-- { intro: string, bullets: string[], conclusion: string } 형태의 JSON 저장
ALTER TABLE issues ADD COLUMN IF NOT EXISTS brief_summary jsonb;
