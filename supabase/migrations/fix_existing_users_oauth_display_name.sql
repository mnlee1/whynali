/**
 * supabase/migrations/fix_existing_users_oauth_display_name.sql
 *
 * [기존 유저 OAuth 실명 정리]
 *
 * 구 트리거(create_users_on_auth_signup)가 신규 가입 시
 * display_name = COALESCE(OAuth 실명, 이메일) 로 저장했던 데이터를 정리.
 *
 * 온보딩을 완료하지 않은 유저(terms_agreed_at IS NULL)의 display_name을
 * NULL로 초기화해 다음 로그인 시 온보딩으로 리다이렉트되어 올바른 닉네임을 설정받도록 함.
 *
 * ※ terms_agreed_at이 있는 유저는 이미 온보딩을 마쳤거나 닉네임을 직접 설정했으므로 건드리지 않음.
 *    그 유저들은 코드 레벨(auth/callback)에서 OAuth 실명 여부를 체크해 처리.
 */

UPDATE public.users
SET display_name = NULL
WHERE terms_agreed_at IS NULL
  AND display_name IS NOT NULL;
