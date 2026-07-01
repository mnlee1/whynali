-- 봇 계정 초기 등록 (public.users)
-- 실행: Supabase SQL Editor 에서 1회 실행
--
-- is_internal = true → KPI 집계 자동 제외 (calculator.ts의 fi() 헬퍼 활용)
-- provider 컬럼 CHECK 조건이 ('구글','네이버','카카오' OR NULL)이므로 NULL 사용.
-- id는 personas.ts의 BOT_PERSONAS 배열과 반드시 일치해야 함.

INSERT INTO public.users (id, provider, provider_id, display_name, is_internal)
VALUES
    ('b0700001-0000-4000-8000-000000000001', NULL, NULL, '영리한여우3842',   true),
    ('b0700001-0000-4000-8000-000000000002', NULL, NULL, '포근한수달7691',   true),
    ('b0700001-0000-4000-8000-000000000003', NULL, NULL, '느긋한부엉이2503', true),
    ('b0700001-0000-4000-8000-000000000004', NULL, NULL, '당당한늑대8174',   true),
    ('b0700001-0000-4000-8000-000000000005', NULL, NULL, '엉뚱한햄스터4926', true)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_internal  = true;
