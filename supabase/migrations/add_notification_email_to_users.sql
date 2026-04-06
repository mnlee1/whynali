-- users 테이블에 알림 수신 이메일 컬럼 추가
-- 로그인 계정과 무관한 이메일 알림 전용 주소

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email TEXT;
