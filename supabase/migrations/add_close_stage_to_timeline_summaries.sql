-- timeline_summaries.stage에 '종결' 추가
-- 종결 요약은 이슈가 종결 전환될 때 AI가 자동 생성

ALTER TABLE timeline_summaries DROP CONSTRAINT IF EXISTS timeline_summaries_stage_check;
ALTER TABLE timeline_summaries ADD CONSTRAINT timeline_summaries_stage_check
    CHECK (stage IN ('발단', '전개', '파생', '진정', '종결'));
