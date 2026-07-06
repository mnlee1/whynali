-- card_news_drafts: 관리자가 미리보기 단계에서 수정한 카드뉴스 텍스트 임시 저장
-- dispatch 시 GitHub Actions에는 draft_id만 전달하고, pipeline.ts가 이 테이블에서
-- 수정된 slides를 그대로 가져다 써서 AI 재생성을 스킵한다.

create table if not exists card_news_drafts (
    id          uuid primary key default gen_random_uuid(),
    issue_id    uuid not null,
    mode        text not null,          -- surging | timeline | qa | debate
    slides      jsonb not null,         -- SlideContent[] (관리자가 수정한 최종 텍스트)
    created_by  text,                   -- 수정한 관리자 이메일
    used_at     timestamptz,            -- pipeline.ts가 소비한 시각 (감사 추적용)
    created_at  timestamptz not null default now()
);

create index if not exists card_news_drafts_created_at_idx on card_news_drafts (created_at desc);
