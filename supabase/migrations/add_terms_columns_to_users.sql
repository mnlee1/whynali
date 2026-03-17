/**
 * supabase/migrations/add_terms_columns_to_users.sql
 *
 * [약관 동의 컬럼 추가 마이그레이션]
 *
 * users 테이블에 약관 동의 관련 컬럼을 추가합니다.
 * - terms_agreed_at: 약관 동의 시각 (NULL이면 신규 유저 = 온보딩 필요)
 * - marketing_agreed: 마케팅 수신 동의 여부
 */

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_agreed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_terms_agreed_at ON users(terms_agreed_at);
