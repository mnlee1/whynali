-- shortform_jobs 테이블에 version 컬럼 추가
-- v1: 기존 숏폼 관리 페이지
-- v2: 새로운 숏폼 관리 페이지 (테스트용)

ALTER TABLE shortform_jobs
    ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'v1';

-- 기존 데이터는 모두 v1로 설정
UPDATE shortform_jobs
    SET version = 'v1'
    WHERE version IS NULL;
