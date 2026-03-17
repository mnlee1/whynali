/**
 * supabase/migrations/fix_users_trigger_no_display_name.sql
 *
 * [신규 유저 display_name NULL 설정 수정]
 *
 * handle_new_user() 트리거 함수를 수정하여 
 * 신규 유저 생성 시 display_name을 NULL로 설정합니다.
 * 온보딩 페이지에서 랜덤 닉네임으로 설정하기 전까지 
 * OAuth 실명이 노출되는 문제를 방지합니다.
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
        NULL
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
