-- supabase/migrations/add_vote_status_and_timestamps.sql
--
-- 투표 테이블에 시점 추적 및 상태 관리 필드 추가
--
-- 추가 필드:
-- - issue_status_snapshot: 투표 생성 당시의 이슈 상태 저장 (점화/논란중/종결)
-- - started_at: 투표 시작(승인) 시각
-- - ended_at: 투표 종료 시각
--
-- phase 값 확장:
-- - 기존: '진행중' | '마감'
-- - 개선: '대기' | '진행중' | '마감'

-- 1. 필드 추가
ALTER TABLE votes ADD COLUMN IF NOT EXISTS issue_status_snapshot TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- 2. 기존 데이터 마이그레이션: 진행중/마감 투표는 started_at을 created_at으로 설정
UPDATE votes
SET started_at = created_at
WHERE phase IN ('진행중', '마감') AND started_at IS NULL;

-- 3. 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_votes_phase ON votes(phase);
CREATE INDEX IF NOT EXISTS idx_votes_issue_status_snapshot ON votes(issue_status_snapshot);

-- 4. 코멘트
COMMENT ON COLUMN votes.issue_status_snapshot IS '투표 생성 당시의 이슈 상태 (점화/논란중/종결). 시점별 여론 변화 추적에 사용.';
COMMENT ON COLUMN votes.started_at IS '투표 시작(승인) 시각. 대기→진행중 전환 시 설정.';
COMMENT ON COLUMN votes.ended_at IS '투표 종료(마감) 시각. 진행중→마감 전환 시 설정.';
