-- supabase/migrations/add_vote_auto_end_options.sql
--
-- 투표 자동 종료 옵션 필드 추가
--
-- 추가 필드:
-- - auto_end_date: 특정 날짜에 자동 종료
-- - auto_end_participants: 특정 참여자 수 도달 시 자동 종료

-- 1. 필드 추가
ALTER TABLE votes ADD COLUMN IF NOT EXISTS auto_end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS auto_end_participants INTEGER;

-- 2. 인덱스 추가 (크론잡 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_votes_auto_end_date ON votes(auto_end_date) WHERE phase = '진행중';

-- 3. 코멘트
COMMENT ON COLUMN votes.auto_end_date IS '자동 종료 날짜. 설정된 경우 해당 시각에 투표가 자동으로 마감됨.';
COMMENT ON COLUMN votes.auto_end_participants IS '목표 참여자 수. 설정된 경우 해당 인원 도달 시 투표가 자동으로 마감됨.';
