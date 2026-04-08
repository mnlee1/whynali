-- ============================================================
-- 왜난리(whynali) DEV DB 전체 셋업 SQL
-- schema.sql + 모든 마이그레이션 통합본
-- Supabase SQL Editor에서 한 번에 실행하세요
-- ============================================================

-- ============================================================
-- 1. 테이블 생성 (의존성 순서대로)
-- ============================================================

-- 이슈 (모든 마이그레이션 컬럼 포함)
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('점화', '논란중', '종결')),
    category TEXT, -- CHECK 제약 제거됨 (애플리케이션 레벨에서 검증)
    heat_index NUMERIC,
    heat_index_1h_ago NUMERIC,
    heat_updated_at TIMESTAMPTZ,
    created_heat_index NUMERIC,
    approval_status TEXT CHECK (approval_status IN ('대기', '승인', '반려', '병합됨')),
    approval_type TEXT CHECK (approval_type IN ('auto', 'manual')),
    approval_heat_index INTEGER,
    approved_at TIMESTAMPTZ,
    merged_into_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    visibility_status VARCHAR(20) NOT NULL DEFAULT 'visible',
    view_count INT NOT NULL DEFAULT 0,
    source_track TEXT DEFAULT 'track_a',
    is_urgent BOOLEAN DEFAULT FALSE,
    burst_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 타임라인 포인트
CREATE TABLE IF NOT EXISTS timeline_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    source_url TEXT,
    stage TEXT CHECK (stage IN ('발단', '전개', '파생', '진정')),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자 (provider NULL 허용, 약관 컬럼 포함)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    provider TEXT CHECK (provider IN ('구글', '네이버', '카카오') OR provider IS NULL),
    provider_id TEXT,
    display_name TEXT,
    terms_agreed_at TIMESTAMPTZ,
    marketing_agreed BOOLEAN DEFAULT FALSE,
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 토론 주제 (comments보다 먼저 생성해야 함)
CREATE TABLE IF NOT EXISTS discussion_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    approval_status TEXT CHECK (approval_status IN ('대기', '진행중', '마감')),
    approved_at TIMESTAMPTZ,
    view_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ,
    auto_end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 댓글
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    discussion_topic_id UUID REFERENCES discussion_topics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    like_count INT DEFAULT 0,
    dislike_count INT DEFAULT 0,
    visibility TEXT CHECK (visibility IN ('public', 'pending_review', 'deleted')) DEFAULT 'public',
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 감정 표현
CREATE TABLE IF NOT EXISTS reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('좋아요', '싫어요', '화나요', '팝콘각', '응원', '애도', '사이다')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(issue_id, user_id)
);

-- 투표
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    title TEXT,
    phase TEXT CHECK (phase IN ('대기', '진행중', '마감')) DEFAULT '대기',
    approval_status TEXT CHECK (approval_status IN ('대기', '승인', '반려')) DEFAULT '대기',
    issue_status_snapshot TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    auto_end_date TIMESTAMPTZ,
    auto_end_participants INTEGER,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 투표 선택지
CREATE TABLE IF NOT EXISTS vote_choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    count INT DEFAULT 0
);

-- 사용자 투표 기록
CREATE TABLE IF NOT EXISTS user_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
    vote_choice_id UUID REFERENCES vote_choices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vote_id, user_id)
);

-- 뉴스 수집 데이터
CREATE TABLE IF NOT EXISTS news_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    link TEXT UNIQUE,
    source TEXT,
    published_at TIMESTAMPTZ,
    category TEXT,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    search_keyword TEXT NOT NULL DEFAULT '(레거시)',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 커뮤니티 수집 데이터
CREATE TABLE IF NOT EXISTS community_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    url TEXT UNIQUE,
    view_count INT,
    comment_count INT,
    written_at TIMESTAMPTZ,
    source_site TEXT,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 세이프티봇 룰
CREATE TABLE IF NOT EXISTS safety_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT CHECK (kind IN ('banned_word', 'ai_banned_word', 'excluded_word')),
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 관리자 로그
CREATE TABLE IF NOT EXISTS admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT,
    target_type TEXT,
    target_id UUID,
    admin_id TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI 키 상태 관리
CREATE TABLE IF NOT EXISTS ai_key_status (
    provider TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_until TIMESTAMPTZ,
    fail_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, key_hash)
);

-- API 사용량 추적
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count INTEGER DEFAULT 0,
    daily_limit INTEGER DEFAULT 25000,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(api_name, date)
);

-- 이슈 후보
CREATE TABLE IF NOT EXISTS issue_candidates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'mixed',
    news_ids UUID[] NOT NULL DEFAULT '{}',
    community_ids UUID[] NOT NULL DEFAULT '{}',
    ai_score INT2 NOT NULL CHECK (ai_score BETWEEN 0 AND 10),
    ai_category TEXT NOT NULL,
    ai_reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 댓글 좋아요
CREATE TABLE IF NOT EXISTS comment_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

-- 댓글 신고
CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('욕설/혐오', '스팸', '허위정보', '기타')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)
);

-- 신고
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IN ('욕설/혐오', '스팸/광고', '허위정보', '기타')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT CHECK (status IN ('대기', '처리완료', '무시')) DEFAULT '대기',
    UNIQUE(comment_id, reporter_id)
);

-- 관리자 설정
CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 숏폼 작업
CREATE TABLE IF NOT EXISTS shortform_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    issue_title TEXT NOT NULL,
    issue_status TEXT NOT NULL CHECK (issue_status IN ('점화', '논란중', '종결')),
    heat_grade TEXT NOT NULL CHECK (heat_grade IN ('높음', '보통', '낮음')),
    source_count JSONB NOT NULL,
    issue_url TEXT NOT NULL,
    video_path TEXT,
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    upload_status JSONB,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('issue_created', 'status_changed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track A 파이프라인 로그
CREATE TABLE IF NOT EXISTS track_a_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    keyword TEXT NOT NULL,
    burst_count INT NOT NULL DEFAULT 0,
    result TEXT NOT NULL CHECK (result IN (
        'issue_created', 'auto_approved', 'duplicate_linked',
        'ai_rejected', 'no_news', 'no_community', 'heat_too_low',
        'no_news_linked', 'no_timeline', 'validation_failed',
        'rate_limited', 'error'
    )),
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    details JSONB
);

-- Claude 크레딧 충전 이력
CREATE TABLE IF NOT EXISTS claude_credit_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charged_at DATE NOT NULL,
    amount_usd NUMERIC(10, 2) NOT NULL,
    memo TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. 인덱스
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_approval_status ON issues(approval_status);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_category_status_heat ON issues(category, status, heat_index DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_issues_heat_index ON issues(heat_index DESC NULLS LAST) WHERE approval_status = '승인';
CREATE INDEX IF NOT EXISTS idx_issues_approval_pending ON issues(approval_status, created_at DESC) WHERE approval_status = '대기';
CREATE INDEX IF NOT EXISTS idx_issues_view_count ON issues(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_issues_merged_into ON issues(merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_unique_title_active ON issues(title) WHERE approval_status IN ('대기', '승인');
CREATE INDEX IF NOT EXISTS issues_title_created_at_idx ON issues(title, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_issue_occurred ON timeline_points(issue_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_visibility ON comments(visibility);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_discussion_topic_id ON comments(discussion_topic_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue_created ON comments(issue_id, created_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_comments_issue_score ON comments(issue_id, (like_count - dislike_count) DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_comments_discussion_created ON comments(discussion_topic_id, created_at DESC) WHERE visibility = 'public' AND discussion_topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactions_issue_type ON reactions(issue_id, type);

CREATE INDEX IF NOT EXISTS idx_votes_issue_phase ON votes(issue_id, phase, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_data_issue_id ON news_data(issue_id);
CREATE INDEX IF NOT EXISTS idx_news_data_created_at ON news_data(created_at);
CREATE INDEX IF NOT EXISTS idx_news_data_updated_at ON news_data(updated_at);
CREATE INDEX IF NOT EXISTS idx_news_data_search_keyword ON news_data(search_keyword);
CREATE INDEX IF NOT EXISTS idx_news_published_category ON news_data(published_at DESC, category);
CREATE INDEX IF NOT EXISTS idx_news_unlinked ON news_data(created_at DESC) WHERE issue_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_data_issue_id ON community_data(issue_id);
CREATE INDEX IF NOT EXISTS idx_community_data_created_at ON community_data(created_at);
CREATE INDEX IF NOT EXISTS idx_community_data_updated_at ON community_data(updated_at);
CREATE INDEX IF NOT EXISTS idx_community_written_at ON community_data(written_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_unlinked ON community_data(created_at DESC) WHERE issue_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_type ON admin_logs(target_type);

CREATE INDEX IF NOT EXISTS idx_ai_key_status_provider ON ai_key_status(provider);
CREATE INDEX IF NOT EXISTS idx_ai_key_status_blocked_until ON ai_key_status(blocked_until);

CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(date);
CREATE INDEX IF NOT EXISTS idx_api_usage_name_date ON api_usage(api_name, date);

CREATE INDEX IF NOT EXISTS idx_issue_candidates_title_created ON issue_candidates(title, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_candidates_status ON issue_candidates(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_reports_comment_id ON reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE INDEX IF NOT EXISTS idx_discussion_issue_approved ON discussion_topics(issue_id, created_at DESC) WHERE approval_status = '진행중';
CREATE INDEX IF NOT EXISTS idx_discussion_approval_pending ON discussion_topics(approval_status, created_at DESC) WHERE approval_status = '대기';
CREATE INDEX IF NOT EXISTS idx_discussion_topics_auto_end_date ON discussion_topics(auto_end_date) WHERE approval_status = '진행중';

CREATE INDEX IF NOT EXISTS idx_shortform_jobs_issue_id ON shortform_jobs(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shortform_jobs_approval_status ON shortform_jobs(approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_track_a_logs_run_at ON track_a_logs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_a_logs_result ON track_a_logs(result);
CREATE INDEX IF NOT EXISTS idx_track_a_logs_keyword ON track_a_logs(keyword);

CREATE INDEX IF NOT EXISTS idx_users_terms_agreed_at ON users(terms_agreed_at);

CREATE UNIQUE INDEX IF NOT EXISTS claude_credit_cycles_active_idx ON claude_credit_cycles(is_active) WHERE is_active = TRUE;


-- ============================================================
-- 3. 함수 및 트리거
-- ============================================================

-- Auth 신규 유저 → public.users 자동 생성 (최신 버전: 이메일 provider 차단)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
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
        RETURN NEW; -- 이메일(관리자) 등 기타 provider는 삽입 건너뜀
    END IF;

    INSERT INTO public.users (id, provider, provider_id, display_name)
    VALUES (NEW.id, provider_name, provider_user_id, NULL)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- source_track NULL 방지 트리거
CREATE OR REPLACE FUNCTION set_default_source_track()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.source_track IS NULL THEN
        NEW.source_track := 'track_a';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_default_source_track ON issues;
CREATE TRIGGER trigger_set_default_source_track
    BEFORE INSERT ON issues
    FOR EACH ROW EXECUTE FUNCTION set_default_source_track();

-- 화력 15점 미만 이슈 생성 방지 트리거
CREATE OR REPLACE FUNCTION prevent_low_heat_creation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_heat_index IS NOT NULL AND NEW.created_heat_index < 15 THEN
        RAISE EXCEPTION '화력 15점 미만 이슈는 생성할 수 없습니다. 현재 화력: %점', NEW.created_heat_index;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_low_heat_creation ON issues;
CREATE TRIGGER trigger_prevent_low_heat_creation
    BEFORE INSERT ON issues
    FOR EACH ROW EXECUTE FUNCTION prevent_low_heat_creation();

-- issue_candidates updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_issue_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_candidates_updated_at ON issue_candidates;
CREATE TRIGGER trg_issue_candidates_updated_at
    BEFORE UPDATE ON issue_candidates
    FOR EACH ROW EXECUTE FUNCTION update_issue_candidates_updated_at();

-- shortform_jobs updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_shortform_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shortform_jobs_updated_at ON shortform_jobs;
CREATE TRIGGER trg_shortform_jobs_updated_at
    BEFORE UPDATE ON shortform_jobs
    FOR EACH ROW EXECUTE FUNCTION update_shortform_jobs_updated_at();

-- discussion_topics body 수정 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_discussion_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.body IS DISTINCT FROM NEW.body THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discussion_topics_updated_at ON discussion_topics;
CREATE TRIGGER trg_discussion_topics_updated_at
    BEFORE UPDATE ON discussion_topics
    FOR EACH ROW EXECUTE FUNCTION update_discussion_topics_updated_at();

-- 투표 참여 원자 처리
CREATE OR REPLACE FUNCTION vote_participate(
    p_vote_id UUID,
    p_choice_id UUID,
    p_user_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
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
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
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
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
    UPDATE issues SET view_count = view_count + 1 WHERE id = p_issue_id;
$$;

-- 토론 조회수 원자 증가
CREATE OR REPLACE FUNCTION increment_discussion_view_count(p_topic_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
    UPDATE discussion_topics SET view_count = view_count + 1 WHERE id = p_topic_id;
$$;


-- ============================================================
-- 4. 기본 데이터
-- ============================================================

INSERT INTO admin_settings (key, value, updated_at)
VALUES ('safety_bot_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 완료
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 왜난리 DEV DB 셋업 완료!';
END $$;
