/**
 * supabase/migrations/fix_trigger_skip_email_provider.sql
 *
 * [이메일(Magic Link) 관리자 유저 트리거 예외 처리]
 *
 * handle_new_user() 트리거는 auth.users INSERT 시 public.users에도 행을 삽입함.
 * 관리자 Magic Link 로그인 시 provider = 'email' 로 auth.users가 생성되는데,
 * public.users.provider CHECK ('구글' | '네이버' | '카카오') 에 걸려 트리거가 실패함.
 *
 * 이메일(관리자) 유저는 public.users에 행이 불필요하므로 삽입을 건너뜀.
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
        -- 이메일 Magic Link(관리자) 등 기타 provider는 public.users 삽입 불필요
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, provider, provider_id, display_name)
    VALUES (
        NEW.id,
        provider_name,
        provider_user_id,
        NULL
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
