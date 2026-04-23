-- ai_key_status 테이블에 block_reason 컬럼 추가
-- rate_limit: 429 Rate Limit
-- credit_depleted: 크레딧 소진 (400 insufficient_balance)
ALTER TABLE ai_key_status
ADD COLUMN IF NOT EXISTS block_reason TEXT;
