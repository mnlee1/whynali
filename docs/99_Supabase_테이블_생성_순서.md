# Supabase 테이블 생성 순서

리셋 후 97_1단계_기초픽스 §3.1 스키마대로 테이블을 만드는 방법.

---

## 1. Supabase SQL Editor 열기

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택
2. 왼쪽 **SQL Editor** 클릭
3. **New query** 선택

---

## 2. 아래 SQL 전체 복사 후 한 번에 실행

아래 블록 전체를 복사해 SQL Editor에 붙여넣고 **Run** (또는 Ctrl/Cmd+Enter) 실행.

```sql
-- 1) issues (다른 테이블이 참조하는 기준 테이블)
CREATE TABLE issues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    status text,
    category text,
    heat_index numeric,
    approval_status text,
    approved_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_issues_category ON issues(category);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_approval_status ON issues(approval_status);
CREATE INDEX idx_issues_created_at ON issues(created_at);

-- 2) users (인증·댓글·투표 등이 참조)
CREATE TABLE users (
    id uuid PRIMARY KEY,
    provider text,
    provider_id text,
    display_name text,
    created_at timestamptz DEFAULT now()
);

-- 3) issues를 참조하는 테이블들
CREATE TABLE timeline_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    occurred_at timestamptz,
    source_url text,
    stage text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_timeline_points_issue_id ON timeline_points(issue_id);

CREATE TABLE discussion_topics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    body text NOT NULL,
    is_ai_generated boolean DEFAULT false,
    approval_status text,
    approved_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    title text,
    phase text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE news_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    link text,
    source text,
    published_at timestamptz,
    issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_news_data_issue_id ON news_data(issue_id);
CREATE INDEX idx_news_data_created_at ON news_data(created_at);

CREATE TABLE community_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    url text,
    view_count int,
    comment_count int,
    written_at timestamptz,
    source_site text,
    issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_community_data_issue_id ON community_data(issue_id);
CREATE INDEX idx_community_data_created_at ON community_data(created_at);

-- 4) votes를 참조하는 테이블
CREATE TABLE vote_choices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id uuid NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    label text NOT NULL,
    count int DEFAULT 0
);

CREATE TABLE user_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id uuid NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    vote_choice_id uuid NOT NULL REFERENCES vote_choices(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- 5) discussion_topics를 참조하는 comments (self-ref 포함)
CREATE TABLE comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id uuid REFERENCES issues(id) ON DELETE CASCADE,
    discussion_topic_id uuid REFERENCES discussion_topics(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL,
    like_count int DEFAULT 0,
    dislike_count int DEFAULT 0,
    visibility text DEFAULT 'public',
    parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_comments_issue_id ON comments(issue_id);
CREATE INDEX idx_comments_discussion_topic_id ON comments(discussion_topic_id);
CREATE INDEX idx_comments_visibility ON comments(visibility);
CREATE INDEX idx_comments_created_at ON comments(created_at);

-- 6) 그 외
CREATE TABLE safety_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text,
    value text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE admin_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text,
    target_type text,
    target_id uuid,
    admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);
```

---

## 3. 실행 후 확인

1. 왼쪽 **Table Editor**에서 테이블 13개가 보이는지 확인.
2. 또는 다시 **SQL Editor**에서 아래 쿼리 실행:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

3. 로컬에서 API로 확인:

```bash
npm run dev
curl http://localhost:3000/api/dev/check-tables
```

`ok: true`, `missing: []` 이면 완료.

---

## 4. (선택) RLS 정책

Supabase는 기본적으로 public 스키마에 RLS가 꺼져 있음. 나중에 인증·권한 적용 시 **Authentication** → **Policies**에서 테이블별 RLS 켜고 정책 추가하면 됨. MVP 초기에는 이 단계 생략해도 됨.

---

## 5. 테이블 생성 후 할 일

### 5.1 환경 변수 넣기

`.env.local`에 Supabase 값 채우기.

- Supabase Dashboard → **Project Settings** → **API** 에서 확인:
  - `NEXT_PUBLIC_SUPABASE_URL` → Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon public
  - `SUPABASE_SERVICE_ROLE_KEY` → service_role (비공개 키)

저장 후 서버 재시작.

### 5.2 API 동작 확인

```bash
npm run dev
```

다른 터미널에서:

```bash
# 테이블 존재 여부
curl http://localhost:3000/api/dev/check-tables

# 이슈 목록 (빈 배열 나오면 정상)
curl "http://localhost:3000/api/issues"

# 이슈 하나 생성 (테스트)
curl -X POST http://localhost:3000/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트 이슈","category":"사회","status":"점화"}'
```

이슈 생성 후 다시 `GET /api/issues` 호출해서 방금 만든 이슈가 보이면 API·DB 연동 정상.

### 5.3 (선택) 공개용 이슈로 보이게 하기

목록 API는 `approval_status = '승인'` 인 이슈만 반환함. 테스트 이슈를 공개하려면 Supabase **Table Editor** → **issues** → 해당 행의 `approval_status`를 `승인`으로 바꾸거나, API로 PATCH:

```bash
curl -X PATCH "http://localhost:3000/api/issues/여기에_이슈_UUID" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"승인"}'
```

### 5.4 그다음: 화면 붙이기 (Day 5–6)

로드맵 기준 담당 A 다음 작업:

- 홈·카테고리 메뉴(연예/스포츠/정치/사회/기술)·이슈 목록 화면 퍼블
- 이슈 목록에 검색/필터/정렬 UI
- 이슈 상세 페이지: 화력·타임라인·출처 링크 영역 + 위 API 연동

이미 있는 라우트(`app/page.tsx`, `app/entertain/page.tsx` 등)에 목록 API를 붙이고, `app/issue/[id]/page.tsx`에 상세·타임라인·출처 API를 연동하면 됨.
