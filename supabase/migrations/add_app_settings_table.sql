-- app_settings: 앱 설정 key-value 저장 테이블
-- TikTok 토큰 등 런타임에 갱신이 필요한 설정값 저장용

create table if not exists app_settings (
    key         text primary key,
    value       jsonb not null,
    updated_at  timestamptz not null default now()
);

-- TikTok 토큰 초기값 삽입
-- access_token은 24시간 만료 → 자동 갱신됨
-- refresh_token은 1년 유효 → .env.local 값을 여기에 넣어두면 자동 관리됨
-- expires_at=0 이면 만료 여부 미확인 상태 (첫 업로드 시 env 값 사용)
insert into app_settings (key, value) values (
    'tiktok_tokens',
    '{
        "access_token": "",
        "refresh_token": "",
        "expires_at": 0
    }'::jsonb
) on conflict (key) do nothing;
