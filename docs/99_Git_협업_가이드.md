# Git 협업 가이드 (왜난리 프로젝트)

작성일: 2026-03-16
대상: Git 초보자 및 왜난리 프로젝트 팀원

## 개요

2명이 Git을 처음 사용하거나 익숙하지 않아도 따라할 수 있는 가이드입니다.
Git 기본 개념부터 왜난리 프로젝트의 15개 브랜치 구조까지 포함합니다.

---

## Part 1: Git 기본 가이드 (초보자용)

### 1. Git이 뭔가요?

**Git**: 코드의 변경 이력을 기록하고 관리하는 도구. "게임 세이브" 같은 개념.
**GitHub**: Git 저장소를 온라인에 올려서 여러 명이 함께 작업할 수 있게 해주는 서비스.

#### 왜 필요한가?

- 팀장과 팀원이 동시에 다른 파일을 작업해도 코드가 섞이지 않음
- 실수로 코드를 망쳐도 이전 버전으로 되돌릴 수 있음
- 누가 언제 무엇을 바꿨는지 기록됨

---

### 2. 기본 용어 정리

| 용어 | 의미 | 예시 |
|------|------|------|
| 저장소(Repository) | 프로젝트 전체 코드가 들어있는 폴더 | whynali 저장소 |
| 커밋(Commit) | 코드 변경을 저장하는 행위. "세이브 포인트" | "이슈 목록 화면 완성" 커밋 |
| 푸시(Push) | 로컬(내 컴퓨터)의 커밋을 GitHub에 업로드 | 내가 작업한 코드를 GitHub에 올림 |
| 풀(Pull) | GitHub의 최신 코드를 로컬로 다운로드 | 팀원이 작업한 코드를 내 컴퓨터로 받음 |
| 브랜치(Branch) | 코드의 "평행세계". 각자 독립된 공간에서 작업 | feature/팀장-이슈목록 브랜치 |
| 머지(Merge) | 다른 브랜치의 코드를 합치는 것 | 팀장 브랜치를 develop 브랜치에 합침 |
| PR(Pull Request) | "내 코드 확인하고 합쳐주세요" 요청 | 팀장이 작업 완료 후 develop에 PR |
| 충돌(Conflict) | 두 명이 같은 파일 같은 줄을 수정했을 때 발생 | 둘 다 Header.tsx 10번째 줄 수정 |

---

### 3. 브랜치 전략 (기본)

```
main (배포용, 항상 안정 상태 유지)
  └── develop (개발 통합 브랜치, 여기서 테스트)
      ├── feature/팀장-기능명 (팀장 작업 브랜치)
      └── feature/팀원-기능명 (팀원 작업 브랜치)
```

#### 브랜치 이름 규칙

- `feature/팀장-이슈목록`: 팀장이 이슈 목록 기능 작업
- `feature/팀원-댓글UI`: 팀원이 댓글 UI 작업
- `feature/팀장-DB스키마`: 팀장이 DB 스키마 설계

#### 작업 흐름 (중요!)

1. `develop` 브랜치에서 새 브랜치 생성
2. 내 브랜치에서 작업
3. 작업 완료 후 커밋
4. GitHub에 푸시
5. PR 생성 (develop 브랜치로)
6. 상대방이 코드 확인 (간단히)
7. 머지
8. 로컬에서 `develop` 브랜치로 전환 후 최신 코드 받기

---

### 4. Git 설치 및 초기 설정

#### 4.1 Git 설치 확인

터미널(맥) 또는 Git Bash(윈도우)에서:

```bash
git --version
```

버전이 나오면 설치됨. 안 나오면:
- 맥: `brew install git`
- 윈도우: https://git-scm.com/download/win

#### 4.2 Git 사용자 설정 (최초 1회)

```bash
git config --global user.name "본인이름"
git config --global user.email "본인이메일@example.com"
```

이 정보가 커밋에 기록됩니다.

---

### 5. 프로젝트 시작하기

#### 5.1 저장소 생성 (팀장만)

1. GitHub 접속 (https://github.com)
2. 우측 상단 `+` → `New repository`
3. 저장소 이름: `whynali`
4. Private 선택 (외부 공개 안 함)
5. `Create repository` 클릭

#### 5.2 팀원 초대 (팀장만)

1. 저장소 페이지에서 `Settings` 탭
2. 좌측 `Collaborators` 클릭
3. `Add people` → 팀원 GitHub 계정 입력
4. 팀원은 이메일로 초대 수락

#### 5.3 로컬에 클론 (둘 다)

터미널에서 작업할 폴더로 이동 후:

```bash
git clone https://github.com/팀장계정/whynali.git
cd whynali
```

이제 로컬에 프로젝트 폴더가 생깁니다.

#### 5.4 Supabase·Vercel 팀 초대 (배포/DB 동시 작업 시)

**Supabase (무료 플랜)**

- **초대 방법**: [대시보드](https://supabase.com/dashboard) → 왼쪽 하단 Organization 선택 → **Team** → 팀원 이메일 입력 후 초대. 초대 링크는 **24시간** 유효.
- **팀원 수**: 무료 플랜에서도 **무제한**.
- **역할 (무료 플랜)**:
    - **Owner**: 조직·프로젝트 전체 권한.
    - **Administrator**: 조직 설정 변경·소유자 추가 제외한 전체 권한.
    - **Developer**: 조직은 읽기 전용, 프로젝트는 데이터/콘텐츠 작업 가능, 프로젝트 설정 변경 불가.
- **무료에서 불가**: Read-Only 역할, 프로젝트 단위(프로젝트 스코프) 역할은 **Team 플랜($599/월) 이상**에서만 가능. 무료는 조직 단위 역할만.
- **참고**: 무료는 조직당 활성 프로젝트 2개 제한. 팀원 중 Owner/Admin이 이미 2개 쓰면 해당 조직에서는 추가 무료 프로젝트 생성 불가.

**Vercel (Hobby = 무료 플랜)**

- **팀 협업**: Hobby 플랜에는 **팀 협업(팀원 초대·역할 부여) 기능이 없음**. 비교표에서 "Team collaboration features"가 Hobby는 `-`, Pro는 `Yes`.
- **즉, 무료로 할 수 있는 것**: 한 사람 계정으로만 Vercel에 배포. 팀원은 GitHub에서만 협업(같은 저장소에서 PR/머지)하고, 배포는 그 한 계정에서만 진행.
- **팀원 초대·권한을 쓰려면**: **Pro 플랜** 필요. Pro 전환 후 팀원 초대 가능, 멤버당 **$20/월** 추가.
- **Pro에서 역할**: Owner, Member, Billing, Viewer Pro 등 RBAC 사용 가능.

**정리 (2명 동시 작업 가정)**

- **GitHub**: 저장소 Collaborators로 팀원 초대.
- **Supabase**: 무료로 팀원 무제한 초대 가능. Owner/Admin/Developer 중 하나 부여. 대시보드 Team 설정에서 이메일 초대.
- **Vercel**: 무료(Hobby)에서는 팀원 초대 불가. 한 계정이 배포 담당하고, 코드 협업은 GitHub만 사용. 팀원도 Vercel에서 배포하려면 Pro($20/멤버·월) 필요.

---

### 6. 일상 작업 흐름 (매일 따라하기)

#### 6.1 작업 시작 전 (항상!)

```bash
git checkout develop
git pull origin develop
```

#### 6.2 새 브랜치 만들기

```bash
git checkout -b feature/팀장-이슈목록
git branch
```

`*` 표시가 현재 브랜치입니다.

#### 6.3 작업하기

코드 수정, 파일 추가 등 작업을 진행합니다.

#### 6.4 변경 사항 확인

```bash
git status
git diff
```

#### 6.5 커밋 만들기

```bash
git add .
git commit -m "이슈 목록 화면 레이아웃 완성"
```

**좋은 커밋 메시지 예시:**
- "이슈 목록 API 연동 완료"
- "댓글 좋아요 버튼 추가"
- "DB 스키마 설계 완료"

**나쁜 커밋 메시지 예시:**
- "작업"
- "수정"
- "ㅇㅇ"

**커밋 메시지 규칙:**
```
feat: 새로운 기능 추가
fix: 버그 수정
refactor: 코드 리팩토링
style: 코드 포맷팅
docs: 문서 수정
test: 테스트 추가/수정
chore: 빌드 업무, 패키지 매니저 수정
```

#### 6.6 GitHub에 푸시

```bash
git push -u origin feature/팀장-이슈목록
git push
```

---

### 7. Pull Request (PR) 만들기

#### 7.0 Cursor 안에서 PR 진행

Cursor는 VS Code 기반이라 **GitHub Pull Requests** 확장을 쓰면 PR 생성·리뷰·머지를 에디터 안에서 할 수 있다.

1. **확장 설치**: Cursor 왼쪽 사이드바 **Extensions**(또는 `Cmd+Shift+X`) → "GitHub Pull Requests" 검색 → **Install** (제작: GitHub).
2. **로그인**: 설치 후 사이드바에 **GitHub** 아이콘 표시. 클릭 후 **Sign in to GitHub**으로 계정 연동.
3. **PR 보기/만들기**:
    - **Source Control**(`Cmd+Shift+G`)에서 브랜치 푸시 후 상단 **Create Pull Request** 버튼으로 바로 PR 생성.
    - 또는 왼쪽 **GitHub** 패널에서 **Pull Requests** 목록 확인, **+** 로 새 PR 생성.
4. **리뷰·머지**: GitHub 패널에서 PR 선택해 코멘트·승인·머지(권한 있을 때) 가능.

브라우저 없이 Cursor만으로 PR 라이프사이클을 처리할 수 있다. 웹이 필요하면 아래처럼 GitHub에서 진행하면 된다.

#### 7.1 GitHub 웹에서 PR 생성

1. GitHub 저장소 페이지 접속
2. `Pull requests` 탭 클릭
3. `New pull request` 버튼
4. Base: `develop`, Compare: `feature/팀장-이슈목록` 선택
5. 제목: "이슈 목록 화면 완성"
6. 설명: 무엇을 작업했는지 간단히 적기
7. `Create pull request` 클릭

**PR 설명 예시:**
```markdown
## 변경 내용
- 이슈 목록 페이지 레이아웃 개선
- 검색 필터 기능 추가
- 반응형 디자인 적용

## 테스트
- [x] 로컬에서 테스트 완료
- [x] 모바일 화면 확인
```

#### 7.2 코드 리뷰 (상대방)

1. GitHub에서 PR 확인
2. `Files changed` 탭에서 코드 확인
3. 문제 없으면 `Merge pull request` 클릭
4. `Confirm merge` 클릭

#### 7.3 브랜치 삭제 (선택)

머지 후 브랜치는 삭제해도 됩니다 (GitHub에서 자동 제안).

---

### 8. 최신 코드 받기 (중요!)

상대방이 작업한 코드를 내 로컬로 받아오기:

```bash
git checkout develop
git pull origin develop
```

**언제 해야 하나?**
- 작업 시작 전 (매번!)
- 상대방이 PR 머지했다고 알려줬을 때

---

### 9. 충돌(Conflict) 해결하기

#### 충돌이 뭔가요?

두 명이 같은 파일의 같은 줄을 수정했을 때 발생합니다.
예: 팀장과 팀원이 둘 다 `Header.tsx`의 10번째 줄을 수정.

#### 충돌 발생 시나리오

```bash
git pull origin develop
# 또는
git merge develop
```

실행 시 아래와 같은 메시지:

```
CONFLICT (content): Merge conflict in src/app/Header.tsx
Automatic merge failed; fix conflicts and then commit the result.
```

#### 충돌 해결 방법

1. 충돌 파일 열기 (예: `src/app/Header.tsx`)

2. 충돌 부분 확인:

```tsx
<<<<<<< HEAD (내 코드)
<h1>왜난리 서비스</h1>
=======
<h1>WhyNari</h1>
>>>>>>> develop (상대방 코드)
```

3. 원하는 코드로 수정 (화살표, 등호 모두 삭제):

```tsx
<h1>왜난리</h1>
```

4. 충돌 해결 후 저장

5. 커밋:

```bash
git add src/app/Header.tsx
git commit -m "충돌 해결: Header 제목 통일"
git push
```

#### 충돌 예방 방법

- 가능한 다른 파일 작업 (팀장: API, 팀원: UI)
- 작업 시작 전 항상 `git pull`
- 자주 커밋, 자주 푸시

---

### 10. 자주 쓰는 명령어 정리

```bash
git status
git branch
git checkout develop
git checkout -b feature/팀장-댓글
git pull origin develop
git add .
git commit -m "작업 내용"
git push
git log --oneline
git restore src/app/page.tsx
git reset --soft HEAD~1
```

---

### 11. VS Code/Cursor에서 Git 사용하기 (추천)

VS Code/Cursor를 사용하면 터미널 명령어 없이 GUI로 Git 사용 가능.

#### 11.1 기본 작업

1. 좌측 `Source Control` 아이콘 (브랜치 모양) 클릭
2. 변경된 파일 목록 확인
3. `+` 버튼으로 파일 추가 (git add)
4. 메시지 입력 후 `Commit` 버튼 (git commit)
5. `Sync Changes` 버튼 (git push + pull)

#### 11.2 브랜치 전환

1. 하단 좌측 브랜치 이름 클릭
2. 원하는 브랜치 선택

#### 11.3 확장 프로그램 추천

- **GitHub Pull Requests**: PR 생성·리뷰·머지 (Cursor/VS Code 내)
- **GitLens**: 커밋 히스토리, 코드 작성자 확인
- **Git Graph**: 브랜치 흐름 시각화

---

### 12. 배포 흐름 (main 브랜치)

#### develop에서 main으로 머지 (중요한 시점에만)

```bash
# 1. develop 브랜치가 안정적이고 배포 준비 완료

# 2. GitHub에서 PR 생성 (develop → main)

# 3. 두 명 모두 확인 후 머지

# 4. main 브랜치는 Vercel에 자동 배포됨
```

**주의:**
- `main` 브랜치는 항상 안정 상태 유지
- 테스트 안 된 코드는 `main`에 머지 금지
- Day 7, Day 12, Day 14 같은 중요 시점에만 `main` 머지

---

### 13. Git 공부 자료

- **Git 공식 가이드**: https://git-scm.com/book/ko/v2
- **생활코딩 Git 강의**: https://opentutorials.org/course/3837
- **GitHub 공식 가이드**: https://docs.github.com/ko

---

## Part 2: 왜난리 프로젝트 브랜치 구조

### 브랜치 구조 (15개)

```
develop (통합 브랜치)
├── 📱 사용자 화면 (3개)
│   ├── feature/user-pages
│   ├── feature/community-discussion
│   └── feature/auth-login
├── 🔧 관리자 화면 (7개)
│   ├── feature/admin-dashboard
│   ├── feature/admin-issues
│   ├── feature/admin-collections
│   ├── feature/admin-votes
│   ├── feature/admin-discussions
│   ├── feature/admin-safety
│   └── feature/admin-logs
└── ⚙️ 백엔드 & 자동화 (5개)
    ├── feature/collectors
    ├── feature/issue-engine
    ├── feature/vote-system
    ├── feature/reactions-comments
    └── feature/safety-bot
```

---

### 브랜치별 책임 범위

#### 📱 사용자 화면

##### 1. feature/user-pages
사용자 메인 화면 (홈/상세/카테고리/검색)

**파일:**
- `app/page.tsx` (홈)
- `app/issue/[id]/page.tsx` (이슈 상세)
- `app/politics/`, `app/society/`, `app/entertain/`, `app/sports/`, `app/tech/page.tsx`
- `app/search/page.tsx`
- `components/issues/*`
- `components/issue/*` (TimelineSection, SourcesSection)
- `components/search/*`
- `app/api/issues/*`
- `app/api/search/*`

**기능:**
- 홈페이지 이슈 목록
- 이슈 상세 페이지
- 카테고리별 필터링
- 검색 기능
- 타임라인/출처 표시

##### 2. feature/community-discussion
커뮤니티 (토론) 화면 + 댓글

**파일:**
- `app/community/page.tsx`
- `app/community/[id]/page.tsx`
- `components/community/*`
- `app/api/discussions/*`

**기능:**
- AI 토론 주제 목록/상세
- 토론 댓글 작성/수정/삭제
- 철학적 토론 참여

##### 3. feature/auth-login
로그인 화면 + 인증

**파일:**
- `app/login/page.tsx`
- `app/auth/callback/*`
- `app/api/auth/*`

**기능:**
- 구글/네이버/카카오 소셜 로그인
- 인증 콜백 처리
- 사용자 정보 조회
- 관리자 권한 확인

---

#### 🔧 관리자 화면

##### 4. feature/admin-dashboard
관리자 대시보드

**파일:**
- `app/admin/page.tsx`
- `app/admin/layout.tsx`
- `app/api/admin/api-usage/*`

**기능:**
- 통계 요약
- API 사용량 현황

##### 5. feature/admin-issues
관리자 이슈 관리

**파일:**
- `app/admin/issues/page.tsx`
- `app/api/admin/issues/*`
- `app/api/admin/candidates/*`

**기능:**
- 이슈 대기 목록
- 이슈 승인/반려/숨김/복원
- 이슈 후보 관리

##### 6. feature/admin-collections
관리자 수집 데이터 관리

**파일:**
- `app/admin/collections/page.tsx`
- `app/api/admin/collections/*`
- `app/api/admin/rematch-community/*`

**기능:**
- 뉴스/커뮤니티 수집 현황
- 이슈 연결 상태 확인
- 커뮤니티 재매칭

##### 7. feature/admin-votes
관리자 투표 관리

**파일:**
- `app/admin/votes/page.tsx`
- `app/api/admin/votes/*`

**기능:**
- AI 생성 투표 승인/반려
- 투표 마감 처리
- 투표 수정

##### 8. feature/admin-discussions
관리자 토론 주제 관리

**파일:**
- `app/admin/discussions/page.tsx`
- `app/api/admin/discussions/*`

**기능:**
- AI 토론 주제 승인/반려
- 토론 주제 생성

##### 9. feature/admin-safety
관리자 세이프티봇 관리

**파일:**
- `app/admin/safety/page.tsx`
- `app/api/admin/safety/*`

**기능:**
- 금칙어 관리
- 검토 대기 댓글/투표 목록
- 댓글 공개/삭제 처리

##### 10. feature/admin-logs
관리자 작업 로그

**파일:**
- `app/admin/logs/page.tsx`
- `app/api/admin/logs/*`

**기능:**
- 관리자 작업 기록 조회
- 작업 이력 추적

---

#### ⚙️ 백엔드 & 자동화

##### 11. feature/collectors
뉴스/커뮤니티 수집

**파일:**
- `lib/collectors/naver-news.ts`
- `lib/collectors/community.ts`
- `app/api/cron/collect-news/*`
- `app/api/cron/collect-community/*`

**기능:**
- 네이버 뉴스 API 수집 (30분 주기)
- 더쿠/네이트판 메타데이터 수집 (3분 주기)

##### 12. feature/issue-engine
이슈 자동 생성 + 화력 + 타임라인

**파일:**
- `lib/candidate/*`
- `lib/analysis/*`
- `lib/timeline/*`
- `lib/linker/*`
- `lib/ai/duplicate-checker.ts`
- `app/api/cron/track-a/*`
- `app/api/cron/auto-create-issue/*`
- `app/api/cron/recalculate-heat/*`
- `app/api/cron/auto-timeline/*`
- `app/api/cron/auto-link/*`

**기능:**
- 수집 데이터 그루핑
- 이슈 자동 등록
- 화력 계산
- 타임라인 자동 생성
- 이슈-뉴스/커뮤니티 자동 연결
- AI 중복 체크

##### 13. feature/vote-system
투표 시스템 (AI 생성 포함)

**파일:**
- `app/api/votes/*`
- `components/issue/VoteSection.tsx`
- `components/votes/*`
- `lib/vote-auto-closer.ts`
- `lib/ai/vote-generator.ts`
- `app/api/cron/auto-end-votes/*`

**기능:**
- 복수 투표 시스템
- 실시간 그래프
- AI 투표 생성
- 투표 자동 마감

##### 14. feature/reactions-comments
감정 표현 + 댓글 시스템

**파일:**
- `app/api/reactions/*`
- `app/api/comments/*`
- `components/issue/ReactionsSection.tsx`
- `components/issue/CommentsSection.tsx`

**기능:**
- 감정 표현 7종
- 댓글 작성/수정/삭제
- 베스트 댓글
- 댓글 정렬
- 좋아요/싫어요

##### 15. feature/safety-bot
세이프티봇 (금칙어 자동 매칭)

**파일:**
- `lib/safety.ts`
- `lib/safety-notification.ts`
- `app/api/cron/cleanup-rate-limit/*`

**기능:**
- 금칙어 자동 매칭
- 검토 대기 처리
- Rate Limit 관리
- 관리자 알림

---

### 담당별 분담

#### 👤 담당A (팀장) - 8개 브랜치
이슈·타임라인·목록·수집·화력·인증

**브랜치:**
1. `feature/user-pages` - 홈/이슈목록/카테고리/이슈상세 상단
2. `feature/auth-login` - 로그인
3. `feature/admin-dashboard` - 관리자 대시보드
4. `feature/admin-issues` - 이슈 관리
5. `feature/admin-collections` - 수집 데이터 관리
6. `feature/admin-logs` - 작업 로그
7. `feature/collectors` - 뉴스/커뮤니티 수집
8. `feature/issue-engine` - 이슈 자동 생성/화력/타임라인

**담당 영역:**
- 이슈 CRUD, 타임라인, 출처 목록 API
- 홈·카테고리·이슈 목록/상세 레이아웃
- 뉴스/커뮤니티 수집 (30분/3분)
- 화력 분석 로직
- Supabase Auth 설정
- 관리자: 이슈/타임라인/수집/화력 관리

#### 👥 담당B (팀원) - 9개 브랜치
참여·커뮤니티·세이프티·검색·숏폼

**브랜치:**
1. `feature/user-pages` - 글로벌 검색
2. `feature/community-discussion` - 커뮤니티/토론
3. `feature/admin-votes` - 투표 관리
4. `feature/admin-discussions` - 토론 주제 관리
5. `feature/admin-safety` - 세이프티봇 관리
6. `feature/vote-system` - 투표 시스템
7. `feature/reactions-comments` - 감정 표현/댓글
8. `feature/safety-bot` - 세이프티봇
9. `feature/shortform` - 숏폼 자동 생성

**담당 영역:**
- 감정 표현, 댓글, 투표, 토론 API
- 세이프티봇 (금칙어·검토 대기)
- 글로벌 검색 API (이슈+토론)
- 이슈 상세 내 감정·댓글·투표 영역
- 커뮤니티 목록/상세
- 관리자: 토론/투표/세이프티 관리
- 숏폼: 영상 메타데이터 자동 생성

#### 협업 브랜치

`feature/user-pages`는 담당 A/B가 각자 담당 영역만 작업:
- A: 홈/카테고리/이슈목록/이슈상세 레이아웃·상단
- B: 글로벌 검색 (`app/search/*`, `app/api/search/*`)

---

### Git 작업 흐름 (왜난리 프로젝트)

#### 1단계: 최신 코드 받기

```bash
cd whynali
git fetch origin
git checkout develop
git pull origin develop
```

#### 2단계: 브랜치 전환 및 작업 시작

```bash
git checkout feature/user-pages
git pull origin feature/user-pages
git merge develop
```

#### 3단계: 파일 수정 및 확인

```bash
git status
git diff
```

#### 4단계: 커밋하기

```bash
git add .
git commit -m "feat: 이슈 목록 페이지 UI 개선"
```

#### 5단계: GitHub에 푸시

```bash
git push origin feature/user-pages
```

#### 6단계: Pull Request 생성

GitHub 웹사이트에서:
1. https://github.com/mnlee1/whynali 접속
2. "Pull requests" 탭 클릭
3. "New pull request" 버튼
4. **base:** `develop` ← **compare:** `feature/user-pages` 선택
5. PR 제목 작성
6. 변경사항 설명 작성
7. "Create pull request" 클릭

#### 7단계: 코드 리뷰 및 머지

1. 팀장이 코드 리뷰
2. 수정 요청 있으면 → 로컬에서 수정 → 다시 푸시
3. 승인되면 → "Merge pull request" 클릭
4. develop 브랜치에 반영됨

#### 8단계: 다음 작업 준비

```bash
git checkout develop
git pull origin develop
git checkout feature/user-pages
git merge develop
```

---

### 협업 테스트 시나리오

#### Phase 0: 저장소 연동 (최초 1회)

**A: 기존 코드 폴더를 GitHub에 올리는 경우**

```bash
cd whynali
git init
git remote add origin https://github.com/deflow-nhnad/whynali.git
```

원격에 이미 main이 있으면:
```bash
git fetch origin
git checkout -b main origin/main
git checkout -b develop origin/develop
```

원격이 비어 있으면:
```bash
git checkout -b main
git add .
git commit -m "초기 커밋: 프로젝트 설정"
git push -u origin main
git checkout -b develop
git push -u origin develop
```

**B: 새로 클론하는 경우**

```bash
git clone https://github.com/deflow-nhnad/whynali.git
cd whynali
git checkout develop
```

#### Phase 1: 브랜치 생성 및 푸시 (A 담당)

```bash
git checkout develop
git pull origin develop
git checkout -b feature/팀장-테스트문서
git add .
git commit -m "브랜치 테스트: 시나리오 문서 추가"
git push -u origin feature/팀장-테스트문서
```

GitHub에서 PR 생성 (Base: `develop`, Compare: `feature/팀장-테스트문서`)

#### Phase 2: PR 확인 및 머지 (B 담당)

1. GitHub → Pull requests에서 PR 열기
2. Files changed 탭에서 변경 내용 확인
3. Merge pull request → Confirm merge

#### Phase 3: develop 최신화 및 팀원 작업 (B 담당)

```bash
git checkout develop
git pull origin develop
git checkout -b feature/팀원-테스트문서
git add .
git commit -m "브랜치 테스트: 팀원 수정 반영"
git push -u origin feature/팀원-테스트문서
```

GitHub에서 PR 생성 (Base: `develop`, Compare: `feature/팀원-테스트문서`)

#### Phase 4: 두 번째 PR 머지 및 최신화 (A+B)

1. A: GitHub에서 B의 PR 머지
2. A와 B 모두:
```bash
git checkout develop
git pull origin develop
git log --oneline -5
```

#### Phase 5: 충돌 없음 확인

서로 다른 파일만 수정했는지 확인. 같은 파일 같은 줄 수정 시 충돌 발생.

---

### 주의사항

#### 브랜치 간 의존성

**공통 파일 (모든 브랜치에서 공유):**
- `components/common/*`
- `components/layout/*`
- `lib/utils/*`
- `lib/supabase/*`
- `types/*`

#### 충돌 방지

- 같은 파일을 여러 브랜치에서 수정하지 않기
- 공통 파일 수정 시 develop에 먼저 머지 후 다른 브랜치에 반영
- 정기적으로 develop을 각 feature 브랜치에 머지

#### 협업 브랜치 작업 규칙

`feature/user-pages`는 A/B가 각자 담당 영역만 수정:
- A: 홈/카테고리/이슈목록/이슈상세 상단
- B: 글로벌 검색 (app/search/*, app/api/search/*)

---

### 빠른 참조

#### 자주 쓰는 명령어

```bash
git status
git branch -a
git checkout develop && git pull origin develop
git checkout feature/user-pages
git add . && git commit -m "feat: 기능 추가"
git push origin feature/user-pages
git checkout develop && git pull origin develop
git checkout feature/user-pages && git merge develop
```

#### 담당A 브랜치 이동

```bash
git checkout feature/user-pages
git checkout feature/auth-login
git checkout feature/issue-engine
git checkout feature/collectors
git checkout feature/admin-dashboard
git checkout feature/admin-issues
git checkout feature/admin-collections
git checkout feature/admin-logs
```

#### 담당B 브랜치 이동

```bash
git checkout feature/user-pages
git checkout feature/community-discussion
git checkout feature/vote-system
git checkout feature/reactions-comments
git checkout feature/safety-bot
git checkout feature/admin-votes
git checkout feature/admin-discussions
git checkout feature/admin-safety
git checkout feature/shortform
```

---

## 문제 해결

### Q1. 여러 브랜치에서 동시에 작업 가능?

가능하지만 권장하지 않음. 한 번에 하나의 브랜치에 집중하는 것이 좋음.

### Q2. 실수로 다른 브랜치 파일을 수정했어요

커밋 전이면 되돌릴 수 있음:
```bash
git checkout -- app/admin/page.tsx
git reset --hard
```

### Q3. develop에 최신 코드 추가됨. 제 브랜치에 반영하려면?

```bash
git checkout develop
git pull origin develop
git checkout feature/user-pages
git merge develop
```

### Q4. 충돌(Conflict) 발생

같은 파일을 두 명이 수정했을 때 발생:
```bash
git status
# 파일을 열어서 충돌 부분 수정
# <<<<<<< HEAD, =======, >>>>>>> develop 제거
git add .
git commit -m "merge: develop 브랜치 병합 및 충돌 해결"
```

### Q5. 푸시가 거부됨 (rejected)

원격 브랜치에 새 커밋이 있을 때:
```bash
git pull origin feature/user-pages
# 충돌 있으면 해결 후
git push origin feature/user-pages
```

### Q6. source_track null 이슈

관리자 페이지에서 특정 이슈가 보이지 않는 경우:

1. `source_track` 값이 null일 가능성
2. 확인: `npx tsx scripts/check_null_source_track_issues.ts`
3. 수정: `npx tsx scripts/fix_all_null_source_track.ts`

---

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| branch is behind 'origin/develop' | `git pull origin develop` |
| Not possible to fast-forward | `git pull --rebase origin develop` |
| main에 실수로 커밋함 (푸시 전) | `git reset --soft HEAD~1` 후 `git checkout develop` |
| push rejected | `git pull origin 브랜치이름` 후 `git push` |
| 브랜치가 안 보임 | `git fetch origin && git branch -a` |

---

## 요약: 매일 해야 할 일

### 작업 시작 전
```bash
git checkout develop
git pull origin develop
git checkout -b feature/본인-기능명
```

### 작업 중
```bash
git add .
git commit -m "작업 내용"
```

### 작업 완료 후
```bash
git push -u origin feature/본인-기능명
```

### 상대방 코드 받기
```bash
git checkout develop
git pull origin develop
```

**이 흐름만 기억하면 됩니다!**

---

**문제가 생기면 팀장에게 바로 연락하세요!**

---

**마지막 업데이트:** 2026-03-16
**문의:** 프로젝트 팀장
