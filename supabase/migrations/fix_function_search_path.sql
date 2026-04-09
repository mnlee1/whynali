/**
 * supabase/migrations/fix_function_search_path.sql
 * 
 * Security Advisor 경고 해결: 모든 함수에 search_path 설정 추가
 * 
 * search_path를 명시하지 않으면 SQL Injection 공격에 취약할 수 있습니다.
 * 특히 SECURITY DEFINER 함수는 반드시 설정해야 합니다.
 */

-- Auth 신규 유저 → public.users 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    provider_name TEXT;
    provider_user_id TEXT;
BEGIN
    IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
        provider_name := '구글';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_app_meta_data->>'provider' = 'kakao' THEN
        provider_name := '카카오';
        provider_user_id := NEW.raw_user_meta_data->>'sub';
    ELSIF NEW.raw_user_meta_data->>'provider' = 'naver' THEN
        provider_name := '네이버';
        provider_user_id := NEW.raw_user_meta_data->>'provider_id';
    ELSE
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, provider, provider_id, display_name)
    VALUES (NEW.id, provider_name, provider_user_id, NULL)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- source_track NULL 방지 트리거
CREATE OR REPLACE FUNCTION set_default_source_track()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.source_track IS NULL THEN
        NEW.source_track := 'track_a';
    END IF;
    RETURN NEW;
END;
$$;

-- 화력 15점 미만 이슈 생성 방지 트리거
CREATE OR REPLACE FUNCTION prevent_low_heat_creation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.created_heat_index IS NOT NULL AND NEW.created_heat_index < 15 THEN
        RAISE EXCEPTION '화력 15점 미만 이슈는 생성할 수 없습니다. 현재 화력: %점', NEW.created_heat_index;
    END IF;
    RETURN NEW;
END;
$$;

-- issue_candidates updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_issue_candidates_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- shortform_jobs updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_shortform_jobs_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- discussion_topics body 수정 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_discussion_topics_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.body IS DISTINCT FROM NEW.body THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

-- 투표 참여 원자 처리
CREATE OR REPLACE FUNCTION vote_participate(
    p_vote_id UUID,
    p_choice_id UUID,
    p_user_id UUID
)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM votes WHERE id = p_vote_id AND phase = '진행중') THEN
        RAISE EXCEPTION 'VOTE_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vote_choices WHERE id = p_choice_id AND vote_id = p_vote_id) THEN
        RAISE EXCEPTION 'INVALID_CHOICE' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'ALREADY_VOTED' USING ERRCODE = 'P0003';
    END IF;
    INSERT INTO user_votes (vote_id, vote_choice_id, user_id) VALUES (p_vote_id, p_choice_id, p_user_id);
    UPDATE vote_choices SET count = count + 1 WHERE id = p_choice_id;
END;
$$;

-- 투표 취소 원자 처리
CREATE OR REPLACE FUNCTION vote_cancel(
    p_vote_id UUID,
    p_user_id UUID
)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_choice_id UUID;
BEGIN
    SELECT vote_choice_id INTO v_choice_id FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id;
    IF v_choice_id IS NULL THEN
        RAISE EXCEPTION 'VOTE_NOT_FOUND' USING ERRCODE = 'P0004';
    END IF;
    DELETE FROM user_votes WHERE vote_id = p_vote_id AND user_id = p_user_id;
    UPDATE vote_choices SET count = GREATEST(count - 1, 0) WHERE id = v_choice_id;
END;
$$;

-- 이슈 조회수 원자 증가
CREATE OR REPLACE FUNCTION increment_issue_view_count(p_issue_id UUID)
RETURNS VOID 
LANGUAGE SQL 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE issues SET view_count = view_count + 1 WHERE id = p_issue_id;
$$;

-- 토론 조회수 원자 증가
CREATE OR REPLACE FUNCTION increment_discussion_view_count(p_topic_id UUID)
RETURNS VOID 
LANGUAGE SQL 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE discussion_topics SET view_count = view_count + 1 WHERE id = p_topic_id;
$$;
