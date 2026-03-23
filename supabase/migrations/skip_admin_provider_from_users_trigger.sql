/**
 * supabase/migrations/skip_admin_provider_from_users_trigger.sql
 *
 * [관리자(이메일 provider) 계정 public.users 삽입 차단]
 *
 * fix_users_trigger_no_display_name.sql 이 ELSE 브랜치에서 이메일 provider 계정도
 * public.users 에 삽입하도록 변경했고, 이로 인해 관리자 계정에 display_name = NULL 행이
 * 생성됨. 관리자는 온보딩이 불필요하므로 이메일 provider는 삽입을 건너뜀.
 *
 * fix_trigger_skip_email_provider.sql 의 의도를 복원.
 * 이 파일명이 알파벳 순서상 뒤에 위치해 최종 적용됨.
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
        -- 이메일(관리자) 등 기타 provider는 public.users 삽입 불필요
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
