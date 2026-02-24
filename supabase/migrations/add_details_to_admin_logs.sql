-- admin_logs 테이블에 details 컬럼 추가
-- 토론 주제 본문 등 액션 대상의 주요 내용을 기록하기 위해 사용됩니다.

ALTER TABLE admin_logs
    ADD COLUMN IF NOT EXISTS details TEXT;
