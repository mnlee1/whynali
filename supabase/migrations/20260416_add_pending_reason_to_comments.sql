-- pending_reason 컬럼 추가: 신고 vs 금칙어 숨김 구분
-- 'safety': 금칙어(세이프티봇)로 인한 pending_review
-- 'report': 신고 임계값 초과로 인한 pending_review

-- 1. pending_reason 컬럼 추가
ALTER TABLE comments ADD COLUMN pending_reason TEXT;

-- 2. CHECK 제약 조건 추가
ALTER TABLE comments ADD CONSTRAINT comments_pending_reason_check 
    CHECK (pending_reason IN ('safety', 'report') OR pending_reason IS NULL);

-- 3. 기존 pending_review 데이터를 모두 'safety'로 마이그레이션
UPDATE comments 
SET pending_reason = 'safety' 
WHERE visibility = 'pending_review' AND pending_reason IS NULL;

-- 4. 인덱스 추가 (조회 성능 최적화)
CREATE INDEX idx_comments_pending_reason ON comments(pending_reason) WHERE pending_reason IS NOT NULL;
