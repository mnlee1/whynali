-- ============================================================
-- RLS (Row Level Security) 설정
-- whynali-dev 및 prod 공통 적용 가능
-- ============================================================

-- ============================================================
-- 1. issues — 승인된 것만 공개 읽기, 쓰기 불가
-- ============================================================
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issues_public_read" ON issues
  FOR SELECT USING (
    approval_status = '승인' AND visibility_status = 'visible'
  );

-- ============================================================
-- 2. timeline_points — 공개 읽기
-- ============================================================
ALTER TABLE timeline_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timeline_points_public_read" ON timeline_points
  FOR SELECT USING (true);

-- ============================================================
-- 3. news_data — 공개 읽기
-- ============================================================
ALTER TABLE news_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_data_public_read" ON news_data
  FOR SELECT USING (true);

-- ============================================================
-- 4. community_data — 공개 읽기
-- ============================================================
ALTER TABLE community_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_data_public_read" ON community_data
  FOR SELECT USING (true);

-- ============================================================
-- 5. votes — 승인된 것만 공개 읽기
-- ============================================================
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes_public_read" ON votes
  FOR SELECT USING (approval_status = '승인');

-- ============================================================
-- 6. vote_choices — 공개 읽기
-- ============================================================
ALTER TABLE vote_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vote_choices_public_read" ON vote_choices
  FOR SELECT USING (true);

-- ============================================================
-- 7. user_votes — 로그인 유저만 읽기/쓰기
-- ============================================================
ALTER TABLE user_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_votes_own_read" ON user_votes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_votes_own_insert" ON user_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. discussion_topics — 승인된 것만 공개 읽기
-- ============================================================
ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discussion_topics_public_read" ON discussion_topics
  FOR SELECT USING (approval_status = '진행중');

-- ============================================================
-- 9. comments — public 상태만 읽기, 로그인 유저만 쓰기
-- ============================================================
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_public_read" ON comments
  FOR SELECT USING (visibility = 'public');

CREATE POLICY "comments_auth_insert" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_own_update" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 10. reactions — 공개 읽기, 로그인 유저만 쓰기/수정/삭제
-- ============================================================
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_public_read" ON reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions_auth_insert" ON reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_own_update" ON reactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "reactions_own_delete" ON reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 11. users — 본인 데이터만 읽기/수정
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_read" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_own_update" ON users
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 12. comment_likes — 로그인 유저만
-- ============================================================
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_likes_auth_read" ON comment_likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "comment_likes_auth_insert" ON comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_likes_own_delete" ON comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 13. 관리/내부 테이블 — 클라이언트 접근 차단 (서비스 롤만)
-- ============================================================
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE safety_rules ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE ai_key_status ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE issue_candidates ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE track_a_logs ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE shortform_jobs ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE claude_credit_cycles ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 모든 클라이언트 접근 차단
