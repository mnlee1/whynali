/**
 * supabase/migrations/fix_admin_logs_admin_id_type.sql
 *
 * admin_logs.admin_id 타입 변경: UUID → TEXT
 *
 * 기존 스키마는 admin_id를 UUID(users.id FK)로 정의했으나,
 * 실제 구현은 관리자 이메일(TEXT)을 저장하도록 되어 있음.
 * 이로 인해 로그 기록이 실패하여 admin_logs 테이블이 비어있는 상태.
 *
 * 변경 사항:
 * - admin_id를 UUID → TEXT로 변경
 * - users 테이블 FK 제약 제거
 * - 관리자 이메일 주소를 직접 저장하도록 변경
 */

-- 1. 기존 FK 제약 조건 삭제
ALTER TABLE admin_logs
    DROP CONSTRAINT IF EXISTS admin_logs_admin_id_fkey;

-- 2. admin_id 컬럼 타입 변경 (UUID → TEXT)
ALTER TABLE admin_logs
    ALTER COLUMN admin_id TYPE TEXT;

-- 3. 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_type ON admin_logs(target_type);
