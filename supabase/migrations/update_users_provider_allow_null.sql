/**
 * supabase/migrations/update_users_provider_allow_null.sql
 *
 * [users.provider CHECK 제약 수정]
 *
 * fix_users_trigger_no_display_name.sql 이 ELSE 브랜치에서 provider = '기타' 로 삽입했고,
 * 이 값이 새 CHECK 제약과 충돌함.
 * 먼저 '기타' 값을 NULL 로 정리한 후 제약을 재설정합니다.
 */

-- 기존 '기타' 등 비정상 provider 값을 NULL 로 정리
UPDATE public.users
SET provider = NULL
WHERE provider NOT IN ('구글', '네이버', '카카오');

-- 기존 제약 제거 후 NULL 허용으로 재추가
ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_provider_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_provider_check
    CHECK (provider IN ('구글', '네이버', '카카오') OR provider IS NULL);
