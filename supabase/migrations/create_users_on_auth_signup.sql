/**
 * supabase/migrations/create_users_on_auth_signup.sql
 *
 * [Auth 유저 자동 생성 트리거]
 *
 * Supabase Auth에서 신규 유저 가입 시 users 테이블에도 자동으로 레코드를 생성합니다.
 * Google, Kakao OAuth 로그인 시 자동으로 users 테이블 레코드가 생성됩니다.
 */

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    provider_name TEXT;
    provider_user_id TEXT;
BEGIN
    IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
        provider_name := '구글';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_app_meta_data->>'provider' = 'kakao' THEN
        provider_name := '카카오';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_user_meta_data->>'provider' = 'naver' THEN
        provider_name := '네이버';
        provider_user_id := NEW.raw_user_meta_data->>'provider_id';
    ELSE
        provider_name := '기타';
        provider_user_id := NEW.id::TEXT;
    END IF;

    INSERT INTO public.users (id, provider, provider_id, display_name)
    VALUES (
        NEW.id,
        provider_name,
        provider_user_id,
        COALESCE(
            NEW.raw_user_meta_data->>'name',
            NEW.raw_user_meta_data->>'full_name',
            NEW.email
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
