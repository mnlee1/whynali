/**
 * supabase/migrations/add_claude_credit_cycles.sql
 *
 * Claude 선불 크레딧 충전 이력 테이블
 *
 * 관리자가 Anthropic에 충전할 때마다 기록한다.
 * is_active=true인 가장 최근 행이 현재 충전 주기이며,
 * 해당 charged_at 이후의 api_usage를 합산해 잔액을 계산한다.
 */

create table if not exists claude_credit_cycles (
    id uuid primary key default gen_random_uuid(),
    charged_at date not null,           -- 충전일 (YYYY-MM-DD)
    amount_usd numeric(10, 2) not null, -- 충전액 (USD)
    memo text,                          -- 메모 (예: 'Anthropic 3월 충전')
    is_active boolean not null default true, -- 현재 활성 충전건 여부
    created_at timestamptz not null default now()
);

-- 활성 충전건은 1개만 존재하도록 인덱스
create unique index if not exists claude_credit_cycles_active_idx
    on claude_credit_cycles (is_active)
    where is_active = true;

-- RLS: 관리자만 접근
alter table claude_credit_cycles enable row level security;

create policy "service_role_only" on claude_credit_cycles
    using (true)
    with check (true);
