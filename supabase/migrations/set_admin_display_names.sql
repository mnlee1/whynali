/**
 * supabase/migrations/set_admin_display_names.sql
 *
 * [관리자 계정 display_name 설정]
 *
 * user_metadata 에 이름이 없는 관리자 계정을 직접 UPSERT 합니다.
 * UPDATE 는 행이 없으면 동작하지 않으므로 INSERT ... ON CONFLICT 를 사용합니다.
 *
 * 실행 전: update_users_provider_allow_null.sql 이 먼저 실행되어야 합니다.
 * 운영자 추가 시: 아래 블록을 복사해 이메일과 이름만 변경 후 실행.
 */

-- 운영자A
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT id, NULL, id::TEXT, '운영자A'
FROM auth.users
WHERE email = 'mnlee@nhnad.com'
ON CONFLICT (id) DO UPDATE SET display_name = '운영자A';

-- 운영자B
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT id, NULL, id::TEXT, '운영자B'
FROM auth.users
WHERE email = 'jeongyun.seo@nhnad.com'
ON CONFLICT (id) DO UPDATE SET display_name = '운영자B';

-- 운영자C
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT id, NULL, id::TEXT, '운영자C'
FROM auth.users
WHERE email = 'ks.kim@nhnad.com'
ON CONFLICT (id) DO UPDATE SET display_name = '운영자C';

-- 운영자D
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT id, NULL, id::TEXT, '운영자D'
FROM auth.users
WHERE email = 'h.gayoung@nhnad.com'
ON CONFLICT (id) DO UPDATE SET display_name = '운영자D';

-- 운영자F
INSERT INTO public.users (id, provider, provider_id, display_name)
SELECT id, NULL, id::TEXT, '운영자F'
FROM auth.users
WHERE email = 'seoyun.hyeong@nhnad.com'
ON CONFLICT (id) DO UPDATE SET display_name = '운영자F';
