# Git 공동작업 가이드 (왜난리 프로젝트)

2명이 Git을 처음 사용하거나 익숙하지 않아도 따라할 수 있도록 작성한 가이드입니다.
한 번 읽고 Git 협업의 기본을 이해할 수 있습니다.

---

## 1. Git이 뭔가요?

**Git**: 코드의 변경 이력을 기록하고 관리하는 도구. "게임 세이브" 같은 개념.
**GitHub**: Git 저장소를 온라인에 올려서 여러 명이 함께 작업할 수 있게 해주는 서비스.

### 왜 필요한가?

- 팀장과 팀원이 동시에 다른 파일을 작업해도 코드가 섞이지 않음
- 실수로 코드를 망쳐도 이전 버전으로 되돌릴 수 있음
- 누가 언제 무엇을 바꿨는지 기록됨

---

## 2. 기본 용어 정리

| 용어 | 의미 | 예시 |
|------|------|------|
| 저장소(Repository) | 프로젝트 전체 코드가 들어있는 폴더 | whynali 저장소 |
| 커밋(Commit) | 코드 변경을 저장하는 행위. "세이브 포인트" | "이슈 목록 화면 완성" 커밋 |
| 푸시(Push) | 로컬(내 컴퓨터)의 커밋을 GitHub에 업로드 | 내가 작업한 코드를 GitHub에 올림 |
| 풀(Pull) | GitHub의 최신 코드를 로컬로 다운로드 | 팀원이 작업한 코드를 내 컴퓨터로 받음 |
| 브랜치(Branch) | 코드의 "평행세계". 각자 독립된 공간에서 작업 | feature/팀장-이슈목록 브랜치 |
| 머지(Merge) | 다른 브랜치의 코드를 합치는 것 | 팀장 브랜치를 dev 브랜치에 합침 |
| PR(Pull Request) | "내 코드 확인하고 합쳐주세요" 요청 | 팀장이 작업 완료 후 dev에 PR |
| 충돌(Conflict) | 두 명이 같은 파일 같은 줄을 수정했을 때 발생 | 둘 다 Header.tsx 10번째 줄 수정 |

---

## 3. 브랜치 전략 (우리 프로젝트 규칙)

```
main (배포용, 항상 안정 상태 유지)
  └── dev (개발 통합 브랜치, 여기서 테스트)
      ├── feature/팀장-기능명 (팀장 작업 브랜치)
      └── feature/팀원-기능명 (팀원 작업 브랜치)
```

### 브랜치 이름 규칙

- `feature/팀장-이슈목록`: 팀장이 이슈 목록 기능 작업
- `feature/팀원-댓글UI`: 팀원이 댓글 UI 작업
- `feature/팀장-DB스키마`: 팀장이 DB 스키마 설계

### 작업 흐름 (중요!)

1. `dev` 브랜치에서 새 브랜치 생성
2. 내 브랜치에서 작업
3. 작업 완료 후 커밋
4. GitHub에 푸시
5. PR 생성 (dev 브랜치로)
6. 상대방이 코드 확인 (간단히)
7. 머지
8. 로컬에서 `dev` 브랜치로 전환 후 최신 코드 받기

---

## 4. Git 설치 및 초기 설정

### 4.1 Git 설치 확인

터미널(맥) 또는 Git Bash(윈도우)에서:

```bash
git --version
# 설치된 Git 버전 확인
```

버전이 나오면 설치됨. 안 나오면:
- 맥: `brew install git`  (맥에서 Git 설치)
- 윈도우: https://git-scm.com/download/win

### 4.2 Git 사용자 설정 (최초 1회)

```bash
git config --global user.name "본인이름"
# 커밋에 표시될 사용자 이름 설정 (전역, 최초 1회)
git config --global user.email "본인이메일@example.com"
# 커밋에 표시될 이메일 설정 (전역, 최초 1회)
```

이 정보가 커밋에 기록됩니다.

---

## 5. 프로젝트 시작하기

### 5.1 저장소 생성 (팀장만)

1. GitHub 접속 (https://github.com)
2. 우측 상단 `+` → `New repository`
3. 저장소 이름: `whynali`
4. Private 선택 (외부 공개 안 함)
5. `Create repository` 클릭

### 5.2 팀원 초대 (팀장만)

1. 저장소 페이지에서 `Settings` 탭
2. 좌측 `Collaborators` 클릭
3. `Add people` → 팀원 GitHub 계정 입력
4. 팀원은 이메일로 초대 수락

### 5.3 로컬에 클론 (둘 다)

터미널에서 작업할 폴더로 이동 후:

```bash
git clone https://github.com/팀장계정/whynali.git
# 원격 저장소 전체를 whynali 폴더로 복제
cd whynali
# 복제된 프로젝트 폴더로 이동
```

이제 로컬에 프로젝트 폴더가 생깁니다.

### 5.4 Supabase·Vercel 팀 초대 (배포/DB 동시 작업 시)

Supabase와 Vercel을 쓸 때 팀원을 어떻게 초대하고, 무료 플랜에서 어디까지 권한을 줄 수 있는지 정리한다.

**Supabase (무료 플랜)**

- **초대 방법**: [대시보드](https://supabase.com/dashboard) → 왼쪽 하단 Organization 선택 → **Team** (또는 [Organization 설정 → Team](https://supabase.com/dashboard/org/_/team)) → 팀원 이메일 입력 후 초대. 초대 링크는 **24시간** 유효.
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

- **GitHub**: 저장소 Collaborators로 팀원 초대 (이 가이드 5.2).
- **Supabase**: 무료로 팀원 무제한 초대 가능. Owner/Admin/Developer 중 하나 부여. 대시보드 Team 설정에서 이메일 초대.
- **Vercel**: 무료(Hobby)에서는 팀원 초대 불가. 한 계정이 배포 담당하고, 코드 협업은 GitHub만 사용. 팀원도 Vercel에서 배포하려면 Pro($20/멤버·월) 필요.

---

## 6. 일상 작업 흐름 (매일 따라하기)

### 6.1 작업 시작 전 (항상!)

```bash
git checkout dev
# dev 브랜치로 전환
git pull origin dev
# 원격 dev의 최신 커밋을 받아와 로컬 dev에 반영 (상대방 작업 반영)
```

### 6.2 새 브랜치 만들기

```bash
git checkout -b feature/팀장-이슈목록
# 해당 이름의 브랜치 생성 후 그 브랜치로 전환
git branch
# 로컬 브랜치 목록 확인 (* 가 붙은 것이 현재 브랜치)
```

`*` 표시가 현재 브랜치입니다.

### 6.3 작업하기

코드 수정, 파일 추가 등 작업을 진행합니다.

### 6.4 변경 사항 확인

```bash
git status
# 변경/스테이징된 파일, 현재 브랜치 등 상태 확인
git diff
# 스테이징 전 변경 내용을 줄 단위로 상세 확인
```

### 6.5 커밋 만들기

```bash
git add .
# 현재 디렉터리 변경 사항 전부 스테이징(커밋 대상으로 추가)
# 또는 특정 파일만:
git add src/app/page.tsx
# 해당 파일만 스테이징
git commit -m "이슈 목록 화면 레이아웃 완성"
# 스테이징된 내용을 로컬 저장소에 커밋 (메시지 필수)
```

**좋은 커밋 메시지 예시:**
- "이슈 목록 API 연동 완료"
- "댓글 좋아요 버튼 추가"
- "DB 스키마 설계 완료"

**나쁜 커밋 메시지 예시:**
- "작업"
- "수정"
- "ㅇㅇ"

### 6.6 GitHub에 푸시

```bash
git push -u origin feature/팀장-이슈목록
# 해당 브랜치를 원격에 올리고, 이후 push 시 이 브랜치가 기본으로 설정됨 (처음 푸시 시)
git push
# 두 번째부터는 위에서 설정한 upstream으로 그냥 푸시
```

---

## 7. Pull Request (PR) 만들기

### 7.1 GitHub에서 PR 생성

1. GitHub 저장소 페이지 접속
2. `Pull requests` 탭 클릭
3. `New pull request` 버튼
4. Base: `dev`, Compare: `feature/팀장-이슈목록` 선택
5. 제목: "이슈 목록 화면 완성"
6. 설명: 무엇을 작업했는지 간단히 적기
7. `Create pull request` 클릭

### 7.2 코드 리뷰 (상대방)

1. GitHub에서 PR 확인
2. `Files changed` 탭에서 코드 확인
3. 문제 없으면 `Merge pull request` 클릭
4. `Confirm merge` 클릭

### 7.3 브랜치 삭제 (선택)

머지 후 브랜치는 삭제해도 됩니다 (GitHub에서 자동 제안).

---

## 8. 최신 코드 받기 (중요!)

상대방이 작업한 코드를 내 로컬로 받아오기:

```bash
git checkout dev
# dev 브랜치로 전환
git pull origin dev
# 원격 dev 최신 커밋을 받아와 로컬 dev에 반영
```

**언제 해야 하나?**
- 작업 시작 전 (매번!)
- 상대방이 PR 머지했다고 알려줬을 때

---

## 9. 충돌(Conflict) 해결하기

### 충돌이 뭔가요?

두 명이 같은 파일의 같은 줄을 수정했을 때 발생합니다.
예: 팀장과 팀원이 둘 다 `Header.tsx`의 10번째 줄을 수정.

### 충돌 발생 시나리오

```bash
git pull origin dev
# 원격 dev를 가져오면서 머지할 때 충돌이 날 수 있음
# 또는 현재 브랜치에서:
git merge dev
# dev 브랜치를 현재 브랜치에 머지할 때 충돌 발생 가능
```

실행 시 아래와 같은 메시지:

```
CONFLICT (content): Merge conflict in src/app/Header.tsx
Automatic merge failed; fix conflicts and then commit the result.
```

### 충돌 해결 방법

1. 충돌 파일 열기 (예: `src/app/Header.tsx`)

2. 충돌 부분 확인:

```tsx
<<<<<<< HEAD (내 코드)
<h1>왜난리 서비스</h1>
=======
<h1>WhyNari</h1>
>>>>>>> dev (상대방 코드)
```

3. 원하는 코드로 수정 (화살표, 등호 모두 삭제):

```tsx
<h1>왜난리</h1>
```

4. 충돌 해결 후 저장

5. 커밋:

```bash
git add src/app/Header.tsx
# 충돌 해결한 파일을 스테이징
git commit -m "충돌 해결: Header 제목 통일"
# 머지 충돌 해결을 완료한 커밋 생성
git push
# 원격에 푸시
```

### 충돌 예방 방법

- 가능한 다른 파일 작업 (팀장: API, 팀원: UI)
- 작업 시작 전 항상 `git pull`
- 자주 커밋, 자주 푸시

---

## 10. 자주 쓰는 명령어 정리

```bash
git status
# 현재 상태 확인 (변경/스테이징된 파일, 브랜치)
git branch
# 로컬 브랜치 목록 확인
git checkout dev
# dev 브랜치로 전환
git checkout -b feature/팀장-댓글
# 해당 이름의 브랜치 생성 후 전환
git pull origin dev
# 원격 dev 최신 코드 받아서 로컬 dev에 반영
git add .
# 변경 사항 전부 스테이징
git commit -m "작업 내용"
# 스테이징된 내용으로 커밋
git push
# 현재 브랜치를 원격에 푸시
git log --oneline
# 커밋 히스토리를 한 줄씩 요약해서 확인
git restore src/app/page.tsx
# 해당 파일의 변경 내역 취소 (커밋 전, 작업 디렉터리만 되돌림)
git reset --soft HEAD~1
# 마지막 커밋만 취소, 변경 내용은 스테이징 상태로 유지 (푸시 전에만)
```

---

## 11. VS Code에서 Git 사용하기 (추천)

VS Code를 사용하면 터미널 명령어 없이 GUI로 Git 사용 가능.

### 11.1 기본 작업

1. 좌측 `Source Control` 아이콘 (브랜치 모양) 클릭
2. 변경된 파일 목록 확인
3. `+` 버튼으로 파일 추가 (git add)
4. 메시지 입력 후 `Commit` 버튼 (git commit)
5. `Sync Changes` 버튼 (git push + pull)

### 11.2 브랜치 전환

1. 하단 좌측 브랜치 이름 클릭
2. 원하는 브랜치 선택

### 11.3 확장 프로그램 추천

- **GitLens**: 커밋 히스토리, 코드 작성자 확인
- **Git Graph**: 브랜치 흐름 시각화

---

## 12. 실전 시나리오 예시

팀장/팀원 모두 동일한 흐름. 브랜치 이름만 `feature/팀장-이슈목록`, `feature/팀원-댓글UI` 등으로 바꿔서 사용.

```bash
git checkout dev && git pull origin dev
# dev로 전환 후 원격 dev 최신화
git checkout -b feature/본인-기능명
# dev 기준 기능 브랜치 생성 후 전환
# 작업 후
git add .
# 변경 사항 전부 스테이징
git commit -m "작업 내용 요약"
# 커밋
git push -u origin feature/본인-기능명
# 원격에 해당 브랜치 푸시 및 upstream 설정
# GitHub에서 PR (dev로) → 리뷰 후 머지
git checkout dev && git pull origin dev
# dev로 돌아온 뒤 머지된 최신 코드 받기
```

---

## 13. 배포 흐름 (main 브랜치)

### dev에서 main으로 머지 (중요한 시점에만)

```bash
# 1. dev 브랜치가 안정적이고 배포 준비 완료

# 2. GitHub에서 PR 생성 (dev → main)

# 3. 두 명 모두 확인 후 머지

# 4. main 브랜치는 Vercel에 자동 배포됨
```

**주의:**
- `main` 브랜치는 항상 안정 상태 유지
- 테스트 안 된 코드는 `main`에 머지 금지
- Day 7, Day 12, Day 14 같은 중요 시점에만 `main` 머지

---

## 14. 트러블슈팅

| 증상 | 해결 |
|------|------|
| branch is behind 'origin/dev' | `git pull origin dev` |
| Not possible to fast-forward | `git pull --rebase origin dev` |
| main에 실수로 커밋함 (푸시 전) | `git reset --soft HEAD~1` 후 `git checkout dev` |
| push rejected | `git pull origin 브랜치이름` 후 `git push` |

---

## 15. Git 공부 자료

- **Git 공식 가이드**: https://git-scm.com/book/ko/v2
- **생활코딩 Git 강의**: https://opentutorials.org/course/3837
- **GitHub 공식 가이드**: https://docs.github.com/ko

---

## 16. 요약: 매일 해야 할 일

### 작업 시작 전
```bash
git checkout dev
# dev 브랜치로 전환
git pull origin dev
# 원격 dev 최신 코드 받기
git checkout -b feature/본인-기능명
# dev 기준 기능 브랜치 생성 후 전환
```

### 작업 중
```bash
git add .
# 변경 사항 스테이징 (자주 실행)
git commit -m "작업 내용"
# 커밋
```

### 작업 완료 후
```bash
git push -u origin feature/본인-기능명
# 원격에 브랜치 푸시 (처음일 때 -u). 이후 GitHub에서 PR 생성
```

### 상대방 코드 받기
```bash
git checkout dev
# dev로 전환
git pull origin dev
# 원격 dev 최신 코드 받기
```

이 흐름만 기억하면 됩니다!
