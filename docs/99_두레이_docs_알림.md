# 저장소 푸시 시 두레이 메신저 알림 (풀 받아야 할 때)

`mnlee1/whynali` 등 해당 저장소에 누군가 푸시를 해서 원격에 변동이 생겼을 때, 두레이(Dooray) 메신저로 알림을 받아 풀을 받을 타이밍을 놓치지 않도록 하는 설정 방법이다.

---

## 1. 사전 준비: 두레이 Incoming Webhook URL

1. 두레이 메신저에서 알림을 받을 **채팅방**(주제 대화) 생성
2. 채팅방 우측 상단 **설정** → **멤버/설정** → **서비스 연동**
3. **서비스 추가** → **Incoming** 선택 후 추가
4. **연동 URL 복사**로 Webhook URL 확보

URL은 비밀로 유지하고 저장소에 커밋하지 않는다.

---

## 2. 알림을 받는 방식: GitHub Actions

원격 저장소에 **push가 발생할 때마다** (누가 push했든, 어떤 파일이 바뀌었든) 워크플로가 실행되어 두레이로 알림을 보낸다. 팀원이 push해도 알림이 오므로, 풀을 받아야 하는 상황을 알 수 있다.

---

## 3. 설정 방법

### 3.1 저장소 시크릿 등록

- GitHub 저장소 (예: https://github.com/mnlee1/whynali) → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**: 이름 `DOORAY_WEBHOOK_URL`, 값에 1단계에서 복사한 Incoming URL

### 3.2 워크플로 파일

`.github/workflows/dooray-push-notify.yml` 생성:

```yaml
name: Dooray push notification
on:
    push:
        branches: [main, master, dev]
jobs:
    notify:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v4
              with:
                  fetch-depth: 2
            
            - name: Get changed files
              id: changed
              run: |
                  git diff --name-only HEAD^ HEAD > changed_files.txt
                  cat changed_files.txt
                  echo "files<<EOF" >> $GITHUB_OUTPUT
                  cat changed_files.txt >> $GITHUB_OUTPUT
                  echo "EOF" >> $GITHUB_OUTPUT
            
            - name: Check common files
              id: check
              run: |
                  if grep -qE '(common|shared|components/common|utils/common|styles/common)' changed_files.txt; then
                      echo "is_common=true" >> $GITHUB_OUTPUT
                  else
                      echo "is_common=false" >> $GITHUB_OUTPUT
                  fi
            
            - name: Notify Dooray (common files)
              if: steps.check.outputs.is_common == 'true'
              env:
                  DOORAY_WEBHOOK_URL: ${{ secrets.DOORAY_WEBHOOK_URL }}
              run: |
                  if [ -z "$DOORAY_WEBHOOK_URL" ]; then exit 0; fi
                  REPO="${{ github.repository }}"
                  BRANCH="${GITHUB_REF#refs/heads/}"
                  COMMIT="${{ github.sha }}"
                  MSG="${{ github.event.head_commit.message }}"
                  ACTOR="${{ github.actor }}"
                  COMMIT_URL="https://github.com/$REPO/commit/$COMMIT"
                  FILES=$(cat changed_files.txt | sed 's/^/• /' | tr '\n' '\n')
                  BODY=$(cat <<EOF
                  {
                      "botName": "Git 알림",
                      "text": "🚨 공통 파일이 업데이트되었습니다!",
                      "attachments": [{
                          "text": "📝 변경된 파일:\n$FILES\n\n👤 작업자: $ACTOR\n💬 커밋 메시지: $MSG\n🔗 커밋 링크: $COMMIT_URL\n\n⚠️ 팀원 여러분, git pull 하세요!",
                          "color": "red"
                      }]
                  }
                  EOF
                  )
                  curl -s -X POST "$DOORAY_WEBHOOK_URL" \
                      -H "Content-Type: application/json" \
                      -d "$BODY"
            
            - name: Notify Dooray (normal push)
              if: steps.check.outputs.is_common == 'false'
              env:
                  DOORAY_WEBHOOK_URL: ${{ secrets.DOORAY_WEBHOOK_URL }}
              run: |
                  if [ -z "$DOORAY_WEBHOOK_URL" ]; then exit 0; fi
                  REPO="${{ github.repository }}"
                  BRANCH="${GITHUB_REF#refs/heads/}"
                  COMMIT="${{ github.sha }}"
                  MSG="${{ github.event.head_commit.message }}"
                  ACTOR="${{ github.actor }}"
                  COMMIT_URL="https://github.com/$REPO/commit/$COMMIT"
                  BODY=$(cat <<EOF
                  {
                      "botName": "Git 알림",
                      "text": "📢 새로운 커밋이 푸시되었습니다",
                      "attachments": [{
                          "text": "👤 작업자: $ACTOR\n📝 브랜치: $BRANCH\n💬 커밋 메시지: $MSG\n🔗 커밋 링크: $COMMIT_URL",
                          "color": "blue"
                      }]
                  }
                  EOF
                  )
                  curl -s -X POST "$DOORAY_WEBHOOK_URL" \
                      -H "Content-Type: application/json" \
                      -d "$BODY"
```

- `push` 시 **경로 제한 없음**: 어떤 파일이 바뀌었든 push만 되면 알림이 간다.
- `branches`는 사용하는 기본 브랜치에 맞게 수정한다. 예시에는 `main`, `master`, `dev` 포함.
- **공통 파일 감지**: 변경된 파일 중 `common`, `shared` 등이 경로에 포함되면 강조 알림(빨간색), 일반 커밋은 기본 알림(파란색).
- 공통 파일 패턴은 `grep -qE '(common|shared|components/common|utils/common|styles/common)'` 부분을 프로젝트에 맞게 수정하면 된다.

---

## 4. 알림 예시

### 4.1 공통 파일 업데이트 시

```
🚨 공통 파일이 업데이트되었습니다!

📝 변경된 파일:
• src/components/common/Header.tsx
• styles/common.css

👤 작업자: mnlee1
💬 커밋 메시지: 공통 헤더 스타일 수정
🔗 커밋 링크: https://github.com/mnlee1/whynali/commit/abc123...

⚠️ 팀원 여러분, git pull 하세요!
```

### 4.2 일반 커밋 푸시 시

```
📢 새로운 커밋이 푸시되었습니다

👤 작업자: mnlee1
📝 브랜치: dev
💬 커밋 메시지: 이슈 목록 페이지 작업
🔗 커밋 링크: https://github.com/mnlee1/whynali/commit/def456...
```

---

## 5. 정리

- **공통 파일 변경 시**: 빨간색 강조 알림 + 변경된 파일 목록 표시 + "git pull 하세요" 안내
- **일반 커밋 푸시 시**: 파란색 기본 알림 + 작업자, 브랜치, 커밋 메시지, 링크
- **공통 파일 패턴**: 워크플로의 `grep -qE` 부분에서 `common`, `shared` 등을 프로젝트 구조에 맞게 수정 가능
- Webhook URL은 반드시 비밀로 두고, 저장소에는 넣지 않는다.
