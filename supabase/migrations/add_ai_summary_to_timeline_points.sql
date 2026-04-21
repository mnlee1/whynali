-- timeline_points 테이블에 ai_summary 컬럼 추가
-- AI가 뉴스 제목을 "타이틀: 설명" 형식으로 요약한 내용을 저장

ALTER TABLE timeline_points
ADD COLUMN IF NOT EXISTS ai_summary TEXT;

COMMENT ON COLUMN timeline_points.ai_summary IS 'AI가 생성한 타임라인 포인트 요약 (타이틀: 설명 형식)';
