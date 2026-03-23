/**
 * supabase/migrations/v2_admin_user_metadata_name.sql
 *
 * [관리자 계정 display_name 복원 및 트리거 수정]
 *
 * 문제 경위:
 * 1. fix_existing_users_oauth_display_name.sql 이 terms_agreed_at IS NULL 인 모든 행의
 *    display_name 을 NULL 로 초기화 → 관리자 이름도 함께 지워짐
 * 2. fix_users_trigger_no_display_name.sql 이 ELSE 브랜치에서 관리자도 삽입하면서
 *    display_name = NULL 강제 지정
 *
 * 이 마이그레이션이 하는 일:
 * STEP 1. handle_new_user() 트리거 수정
 *   - 이메일(관리자) provider 계정은 user_metadata.full_name / name 이 있으면
 *     display_name 과 함께 public.users 에 삽입.
 *   - 이름이 없으면 삽입하지 않음 (기존 skip 동작 유지).
 *
 * STEP 2. 기존 관리자 계정 display_name 복원
 *   - auth.users.raw_user_meta_data 에서 full_name / name 을 읽어
 *     public.users 에 행이 없으면 INSERT, 있으면 UPDATE.
 */

-- ─── STEP 1. 트리거 수정 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    provider_name    TEXT;
    provider_user_id TEXT;
    admin_name       TEXT;
BEGIN
    IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
        provider_name    := '구글';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_app_meta_data->>'provider' = 'kakao' THEN
        provider_name    := '카카오';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_user_meta_data->>'provider' = 'naver' THEN
        provider_name    := '네이버';
        provider_user_id := NEW.raw_user_meta_data->>'provider_id';
    ELSE
        -- 이메일(관리자) provider: user_metadata 에 이름이 있으면 삽입, 없으면 건너뜀
        admin_name := COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name'
        );
        IF admin_name IS NOT NULL THEN
            INSERT INTO public.users (id, provider, provider_id, display_name)
            VALUES (NEW.id, NULL, NEW.id::TEXT, admin_name)
            ON CONFLICT (id) DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, provider, provider_id, display_name)
    VALUES (NEW.id, provider_name, provider_user_id, NULL)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── STEP 2. 기존 관리자 계정 display_name 복원 ─────────────────────────────

-- 2-a. 이미 public.users 행이 있는 경우: display_name 을 user_metadata 값으로 업데이트
UPDATE public.users pu
SET display_name = COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name'
)
FROM auth.users au
WHERE pu.id = au.id
    AND au.email ILIKE '%@nhnad.com'
    AND pu.display_name IS NULL
    AND COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    ) IS NOT NULL;

-- 2-b. public.users 행이 없는 경우: INSERT
-- (update_users_provider_allow_null.sql 이 먼저 실행돼 있어야 함)
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT
    au.id,
    NULL,
    au.id::TEXT,
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    )
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE au.email ILIKE '%@nhnad.com'
    AND pu.id IS NULL
    AND COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    ) IS NOT NULL;
