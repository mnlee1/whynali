-- ======================================================================
-- 투표 관리 화면 DB 마이그레이션 통합본
-- ======================================================================
-- 사용법: Supabase Dashboard > SQL Editor에서 전체 실행
-- 적용 순서: vote_status_timestamps → auto_end_options → approval_status → is_ai_generated → atomic_functions → approval_heat_index
-- 멱등성 보장: 이미 적용된 DB에 재실행해도 안전
-- ======================================================================

-- ① add_vote_status_and_timestamps
-- 투표 테이블에 시점 추적 및 상태 관리 필드 추가
-- 추가 필드: issue_status_snapshot, started_at, ended_at
-- phase 값 확장: '대기' | '진행중' | '마감'

ALTER TABLE votes ADD COLUMN IF NOT EXISTS issue_status_snapshot TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

UPDATE votes
SET started_at = created_at
WHERE phase IN ('진행중', '마감') AND started_at IS NULL;

-- phase CHECK 제약 (대기 추가)
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_phase_check;
ALTER TABLE votes ADD CONSTRAINT votes_phase_check 
    CHECK (phase IN ('대기', '진행중', '마감'));

CREATE INDEX IF NOT EXISTS idx_votes_phase ON votes(phase);
CREATE INDEX IF NOT EXISTS idx_votes_issue_status_snapshot ON votes(issue_status_snapshot);

COMMENT ON COLUMN votes.issue_status_snapshot IS '투표 생성 당시의 이슈 상태 (점화/논란중/종결). 시점별 여론 변화 추적에 사용.';
COMMENT ON COLUMN votes.started_at IS '투표 시작(승인) 시각. 대기→진행중 전환 시 설정.';
COMMENT ON COLUMN votes.ended_at IS '투표 종료(마감) 시각. 진행중→마감 전환 시 설정.';

-- ② 20260305132052_add_vote_auto_end_options
-- 투표 자동 종료 옵션 필드 추가
-- 추가 필드: auto_end_date, auto_end_participants

ALTER TABLE votes ADD COLUMN IF NOT EXISTS auto_end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS auto_end_participants INTEGER;

CREATE INDEX IF NOT EXISTS idx_votes_auto_end_date ON votes(auto_end_date) WHERE phase = '진행중';

COMMENT ON COLUMN votes.auto_end_date IS '자동 종료 날짜. 설정된 경우 해당 시각에 투표가 자동으로 마감됨.';
COMMENT ON COLUMN votes.auto_end_participants IS '목표 참여자 수. 설정된 경우 해당 인원 도달 시 투표가 자동으로 마감됨.';

-- ③ 20260305134500_add_approval_status_to_votes
-- 투표 테이블에 approval_status 필드 추가
-- 반려와 삭제를 구분하기 위함
-- approval_status: 대기 | 승인 | 반려

ALTER TABLE votes ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT '대기';

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_approval_status_check;
ALTER TABLE votes ADD CONSTRAINT votes_approval_status_check 
    CHECK (approval_status IN ('대기', '승인', '반려'));

UPDATE votes 
SET approval_status = CASE 
    WHEN phase = '대기' THEN '대기'
    ELSE '승인'
END
WHERE approval_status IS NULL OR approval_status = '대기';

CREATE INDEX IF NOT EXISTS idx_votes_approval_status ON votes(approval_status);

COMMENT ON COLUMN votes.approval_status IS '관리자 검토 상태. 대기=검토 전, 승인=사용자 노출, 반려=거부됨(삭제 전)';

-- ④ add_is_ai_generated_to_votes
-- AI 생성 여부 플래그 추가

ALTER TABLE votes ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN votes.is_ai_generated IS 'AI 자동 생성 여부. true=AI 생성, false=관리자 직접 생성';

-- ⑤ add_vote_atomic_functions
-- 투표 참여/취소 원자 처리 함수
-- 기존: user_votes insert/delete + vote_choices count 증감을 분리 호출
-- 개선: 단일 트랜잭션으로 묶어 중간 실패 시 카운트 불일치 방지

CREATE OR REPLACE FUNCTION vote_participate(
    p_vote_id       uuid,
    p_choice_id     uuid,
    p_user_id       uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM votes WHERE id = p_vote_id AND phase = '진행중'
    ) THEN
        RAISE EXCEPTION 'VOTE_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM vote_choices WHERE id = p_choice_id AND vote_id = p_vote_id
    ) THEN
        RAISE EXCEPTION 'INVALID_CHOICE' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO user_votes (vote_id, vote_choice_id, user_id)
    VALUES (p_vote_id, p_choice_id, p_user_id);

    UPDATE vote_choices
    SET count = count + 1
    WHERE id = p_choice_id;
END;
$$;

CREATE OR REPLACE FUNCTION vote_cancel(
    p_vote_id   uuid,
    p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_choice_id uuid;
BEGIN
    SELECT vote_choice_id INTO v_choice_id
    FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    IF v_choice_id IS NULL THEN
        RAISE EXCEPTION 'VOTE_NOT_FOUND' USING ERRCODE = 'P0004';
    END IF;

    DELETE FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    UPDATE vote_choices
    SET count = GREATEST(count - 1, 0)
    WHERE id = v_choice_id;
END;
$$;

-- ⑥ 20260305140000_add_approval_heat_index
-- issues 테이블에 승인 당시 화력 지수 저장 필드 추가

ALTER TABLE issues ADD COLUMN IF NOT EXISTS approval_heat_index INTEGER;

COMMENT ON COLUMN issues.approval_heat_index IS '승인/반려 당시 화력 지수 (자동 승인/반려 근거)';

-- ======================================================================
-- 적용 확인 쿼리
-- ======================================================================
-- 아래 쿼리 결과에 모든 컬럼이 표시되면 정상 적용된 것입니다.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'votes'
  AND column_name IN (
    'approval_status', 'issue_status_snapshot',
    'started_at', 'ended_at',
    'auto_end_date', 'auto_end_participants',
    'is_ai_generated'
  )
ORDER BY column_name;

-- 함수 존재 확인
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('vote_participate', 'vote_cancel');

-- issues 테이블 approval_heat_index 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'issues'
  AND column_name = 'approval_heat_index';
