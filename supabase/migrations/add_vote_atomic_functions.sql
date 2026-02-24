-- supabase/migrations/add_vote_atomic_functions.sql
--
-- 투표 참여/취소 원자 처리 함수
--
-- 기존: user_votes insert/delete + vote_choices count 증감을 분리 호출
-- 개선: 단일 트랜잭션으로 묶어 중간 실패 시 카운트 불일치 방지
--
-- 사용:
--   SELECT vote_participate('{vote_id}', '{choice_id}', '{user_id}');
--   SELECT vote_cancel('{vote_id}', '{user_id}');

-- ── 투표 참여 ──────────────────────────────────────────────────────────────
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
    -- 투표가 진행중인지 확인
    IF NOT EXISTS (
        SELECT 1 FROM votes WHERE id = p_vote_id AND phase = '진행중'
    ) THEN
        RAISE EXCEPTION 'VOTE_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    -- 선택지가 해당 투표에 속하는지 확인
    IF NOT EXISTS (
        SELECT 1 FROM vote_choices WHERE id = p_choice_id AND vote_id = p_vote_id
    ) THEN
        RAISE EXCEPTION 'INVALID_CHOICE' USING ERRCODE = 'P0002';
    END IF;

    -- 중복 투표 방지 (race-safe: unique 제약 위반 시 아래 insert에서 잡힘)
    IF EXISTS (
        SELECT 1 FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'P0003';
    END IF;

    -- 투표 기록 저장
    INSERT INTO user_votes (vote_id, vote_choice_id, user_id)
    VALUES (p_vote_id, p_choice_id, p_user_id);

    -- 선택지 count +1
    UPDATE vote_choices
    SET count = count + 1
    WHERE id = p_choice_id;
END;
$$;

-- ── 투표 취소 ──────────────────────────────────────────────────────────────
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
    -- 기존 투표 기록 조회
    SELECT vote_choice_id INTO v_choice_id
    FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    IF v_choice_id IS NULL THEN
        RAISE EXCEPTION 'VOTE_NOT_FOUND' USING ERRCODE = 'P0004';
    END IF;

    -- 투표 기록 삭제
    DELETE FROM user_votes
    WHERE vote_id = p_vote_id AND user_id = p_user_id;

    -- 선택지 count -1 (0 미만 방지)
    UPDATE vote_choices
    SET count = GREATEST(count - 1, 0)
    WHERE id = v_choice_id;
END;
$$;
