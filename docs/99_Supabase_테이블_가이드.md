# Supabase 테이블 가이드

Supabase 데이터베이스 테이블 생성 및 확인 방법.

## 테이블 목록

| 테이블명 | 담당 | 역할 |
|----------|------|------|
| issues | A | 이슈 기본 정보 |
| timeline_points | A | 타임라인 포인트 |
| news_data | A | 뉴스 수집 |
| community_data | A | 커뮤니티 수집 |
| users | B | 사용자 정보 |
| reactions | B | 감정 표현 |
| comments | B | 댓글 |
| votes | B | 투표 |
| vote_choices | B | 투표 선택지 |
| user_votes | B | 사용자 투표 |
| discussion_topics | B | 토론 주제 |
| safety_rules | B | 금칙어·설정 |
| admin_logs | A·B | 관리자 로그 |

## 테이블 생성 방법

### 1. Supabase SQL Editor 열기

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택
2. 왼쪽 **SQL Editor** 클릭
3. **New query** 선택

### 2. SQL 전체 복사 후 실행

아래 블록 전체를 복사해 SQL Editor에 붙여넣고 **Run** 실행.

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

## 테이블 확인 방법

### 방법 1: 대시보드
1. 왼쪽 **Table Editor** 클릭
2. 테이블 13개가 보이는지 확인

### 방법 2: SQL Editor
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

결과에 13개 테이블이 모두 나오는지 확인.

### 방법 3: 프로젝트 API
환경 변수 설정 후:
```bash
npm run dev
curl http://localhost:3000/api/dev/check-tables
```

응답:
```json
{
  "ok": true,
  "existing": ["issues", "timeline_points", ...],
  "missing": []
}
```

## 테이블 생성 후 할 일

### 1. 환경 변수 설정
`.env.local`에 Supabase 값 입력:
- Supabase Dashboard → **Project Settings** → **API**
- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon public
- `SUPABASE_SERVICE_ROLE_KEY`: service_role (비공개 키)

### 2. API 동작 확인
```bash
npm run dev
```

다른 터미널에서:
```bash
# 테이블 존재 여부
curl http://localhost:3000/api/dev/check-tables

# 이슈 목록 (빈 배열이면 정상)
curl "http://localhost:3000/api/issues"

# 이슈 생성 테스트
curl -X POST http://localhost:3000/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트 이슈","category":"사회","status":"점화"}'
```

### 3. 공개용 이슈 설정
테스트 이슈를 공개하려면:
- Supabase **Table Editor** → **issues** → `approval_status`를 `승인`으로 변경
- 또는 API로 PATCH:
```bash
curl -X PATCH "http://localhost:3000/api/issues/이슈_UUID" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"승인"}'
```

## 테이블이 없을 때

- 위 SQL을 Supabase **SQL Editor**에서 실행
- 또는 팀에서 사용하는 마이그레이션 스크립트 실행

## RLS 정책 (선택)

초기 MVP에서는 RLS 생략 가능.
나중에 인증·권한 적용 시:
- **Authentication** → **Policies**에서 테이블별 RLS 활성화
- 정책 추가
