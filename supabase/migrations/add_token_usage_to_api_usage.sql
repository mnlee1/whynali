-- supabase/migrations/add_token_usage_to_api_usage.sql
--
-- API 사용량 테이블에 토큰 사용량 추적 컬럼 추가
--
-- Perplexity API 등 토큰 기반 과금 API의 사용량을 추적하기 위해
-- input_tokens, output_tokens, total_tokens 컬럼을 추가합니다.

ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN api_usage.input_tokens IS '입력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.output_tokens IS '출력 토큰 수 (누적)';
COMMENT ON COLUMN api_usage.total_tokens IS '전체 토큰 수 (누적)';
