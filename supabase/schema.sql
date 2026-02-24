-- 왜난리 서비스 DB 스키마
-- 97_1단계_기초픽스.md §3 기준

-- 이슈
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('점화', '논란중', '종결')),
    category TEXT CHECK (category IN ('연예', '스포츠', '정치', '사회', '기술')),
    heat_index NUMERIC,
    approval_status TEXT CHECK (approval_status IN ('대기', '승인', '반려')),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 타임라인 포인트
CREATE TABLE timeline_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    source_url TEXT,
    stage TEXT CHECK (stage IN ('발단', '전개', '파생', '진정')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자
CREATE TABLE users (
    id UUID PRIMARY KEY,
    provider TEXT CHECK (provider IN ('구글', '네이버', '카카오')),
    provider_id TEXT,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 감정 표현
CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('좋아요', '싫어요', '화나요', '팝콘각', '응원', '애도', '사이다')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(issue_id, user_id)
);

-- 댓글
CREATE TABLE comments (
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

-- 투표
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    title TEXT,
    phase TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 투표 선택지
CREATE TABLE vote_choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    count INT DEFAULT 0
);

-- 사용자 투표 기록
CREATE TABLE user_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
    vote_choice_id UUID REFERENCES vote_choices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vote_id, user_id)
);

-- 토론 주제
CREATE TABLE discussion_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    approval_status TEXT CHECK (approval_status IN ('대기', '승인', '반려')),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 뉴스 수집 데이터
CREATE TABLE news_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    link TEXT,
    source TEXT,
    published_at TIMESTAMPTZ,
    category TEXT CHECK (category IN ('연예', '스포츠', '정치', '사회', '기술')),
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 커뮤니티 수집 데이터
CREATE TABLE community_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    url TEXT,
    view_count INT,
    comment_count INT,
    written_at TIMESTAMPTZ,
    source_site TEXT,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 세이프티봇 룰
CREATE TABLE safety_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 관리자 로그
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT,
    target_type TEXT,
    target_id UUID,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_issues_category ON issues(category);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_approval_status ON issues(approval_status);
CREATE INDEX idx_issues_created_at ON issues(created_at);
CREATE INDEX idx_comments_issue_id ON comments(issue_id);
CREATE INDEX idx_comments_discussion_topic_id ON comments(discussion_topic_id);
CREATE INDEX idx_comments_visibility ON comments(visibility);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_timeline_points_issue_id ON timeline_points(issue_id);
CREATE INDEX idx_news_data_issue_id ON news_data(issue_id);
CREATE INDEX idx_news_data_category ON news_data(category);
CREATE INDEX idx_news_data_created_at ON news_data(created_at);
CREATE INDEX idx_community_data_issue_id ON community_data(issue_id);
CREATE INDEX idx_community_data_created_at ON community_data(created_at);
