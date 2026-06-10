-- card_news_logs: 카드뉴스 발행 이력
-- 발행된 게시물의 post_id를 저장해두어야 나중에 Instagram Insights API로 성과 조회 가능

create table if not exists card_news_logs (
    id              uuid primary key default gen_random_uuid(),
    published_at    timestamptz not null default now(),
    mode            text not null,          -- weekend-recap | surging | weekly-top3 | by-category | timeline
    issues          jsonb not null,         -- [{ id, title, category, heat_index }]
    tags_instagram  text,                   -- 실제 사용된 인스타 해시태그
    tags_threads    text,                   -- 실제 사용된 스레드 해시태그
    slide_count     integer,
    ig_post_id      text,                   -- Instagram media_publish 응답 id
    threads_post_id text,                   -- Threads threads_publish 응답 id
    ig_success      boolean default false,
    threads_success boolean default false,
    created_at      timestamptz not null default now()
);

-- 발행일 기준 조회용 인덱스
create index if not exists card_news_logs_published_at_idx on card_news_logs (published_at desc);
