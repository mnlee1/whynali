-- timeline_points 테이블에 title 컬럼 추가
-- 트랙A에서 타임라인 생성 시 뉴스 제목을 함께 저장하여 사용자에게 보여주기 위함

ALTER TABLE timeline_points
ADD COLUMN title TEXT;

COMMENT ON COLUMN timeline_points.title IS '타임라인 포인트 제목 (뉴스 제목 등)';
