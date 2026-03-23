/**
 * supabase/migrations/add_track_a_logs_table.sql
 *
 * [Track A 파이프라인 실행 로그 테이블]
 *
 * 키워드별 처리 결과를 저장하여 드롭 이유를 추적합니다.
 * 관리자 대시보드 > 수집 현황 > 파이프라인 로그 탭에서 조회합니다.
 *
 * 실행 방법: Supabase 대시보드 → SQL Editor → 아래 SQL 실행
 */

CREATE TABLE IF NOT EXISTS public.track_a_logs (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    run_at      timestamptz NOT NULL DEFAULT now(),
    keyword     text        NOT NULL,
    burst_count int         NOT NULL DEFAULT 0,
    result      text        NOT NULL CHECK (result IN (
                    'issue_created',      -- 이슈 생성 성공
                    'auto_approved',      -- 이슈 생성 + 자동 승인
                    'duplicate_linked',   -- 기존 이슈에 커뮤니티 글 연결
                    'ai_rejected',        -- AI 검증 실패
                    'no_news',            -- 뉴스 0건 (루머 가능성)
                    'no_community',       -- 커뮤니티 필터링 후 관련 글 없음
                    'heat_too_low',       -- 화력 미달 (MIN_HEAT_TO_REGISTER 미만)
                    'no_news_linked',     -- 뉴스 연결 실패 (모두 다른 이슈에 연결됨)
                    'no_timeline',        -- 타임라인 생성 실패
                    'validation_failed',  -- 이슈 데이터 검증 실패
                    'rate_limited',       -- Groq Rate Limit
                    'error'               -- 처리 중 예외 발생
                )),
    issue_id    uuid        REFERENCES public.issues(id) ON DELETE SET NULL,
    details     jsonb       -- AI 응답, 뉴스 건수, 화력 등 부가 정보
);

-- 최신 순 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_track_a_logs_run_at  ON public.track_a_logs (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_a_logs_result  ON public.track_a_logs (result);
CREATE INDEX IF NOT EXISTS idx_track_a_logs_keyword ON public.track_a_logs (keyword);

-- 30일 이상 된 로그 자동 삭제 (선택 — Supabase pg_cron 필요 시 별도 설정)
-- DELETE FROM public.track_a_logs WHERE run_at < now() - interval '30 days';

COMMENT ON TABLE  public.track_a_logs IS 'Track A 파이프라인 키워드별 처리 결과 로그';
COMMENT ON COLUMN public.track_a_logs.result IS 'issue_created|auto_approved|duplicate_linked|ai_rejected|no_news|no_community|heat_too_low|no_news_linked|no_timeline|validation_failed|rate_limited|error';
COMMENT ON COLUMN public.track_a_logs.details IS 'AI 신뢰도, 뉴스 건수, 화력 등 부가 정보 (JSON)';
