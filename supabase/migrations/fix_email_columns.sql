-- notification_email 제거 (contact_email로 통합)
-- provider_email 추가 (OAuth 로그인 계정 이메일)

ALTER TABLE users DROP COLUMN IF EXISTS notification_email;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_email TEXT;
