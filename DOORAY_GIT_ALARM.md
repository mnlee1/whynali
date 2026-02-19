# Git 변경/푸시 시 두레이(Dooray) 메신저 알림 받기

Git 변경사항 또는 새 푸시가 있을 때 두레이 메신저로 알림을 받는 방법이다.

---

## 1. 두레이 Incoming Webhook URL 발급

1. 두레이 메신저에서 알림을 받을 **채팅방**(주제 대화) 생성
2. 채팅방 우측 상단 **설정** → **멤버/설정** → **서비스 연동**
3. **서비스 추가** 탭에서 **Incoming** 선택 후 추가
4. **연동 URL 복사**로 Webhook URL 확보 (이 URL로 POST 시 해당 채팅방에 메시지 전달됨)

URL은 비밀이므로 `.env` 또는 로컬 설정에만 보관하고 저장소에 커밋하지 말 것.

---

## 2. 알림을 받는 두 가지 경우

| 경우 | 방식 | 비고 |
|------|------|------|
| **내가 로컬에서 push할 때** | Git `post-push` 훅에서 스크립트로 Dooray URL에 POST | 해당 PC에서만 동작 |
| **원격 저장소에 push가 있을 때**(팀원 포함) | GitHub/GitLab Webhook + 중계 또는 **GitHub Actions** | 저장소별 설정 |

---

## 3. 로컬에서 push할 때 알림 (Git Hook)

로컬에서 `git push`를 실행한 직후에만 두레이로 알림을 보내려면 **post-push** 훅을 사용한다.

### 3.1 훅 설치

1. 프로젝트 루트에서:
   ```bash
   # 훅 디렉터리 없으면 생성
   mkdir -p .git/hooks
   ```
2. 아래 스크립트를 `.git/hooks/post-push` 로 저장하고 실행 권한 부여:
   ```bash
   chmod +x .git/hooks/post-push
   ```
3. Webhook URL을 환경변수로 설정 (쉘 설정 파일 또는 터미널에서):
   ```bash
   export DOORAY_WEBHOOK_URL="https://hook.dooray.com/..."
   ```

### 3.2 post-push 훅 스크립트 예시

`post-push`는 Git 기본 훅이 아니므로, **push 후**에 호출되는 훅을 쓰려면 다음 중 하나를 사용한다.

- **방법 A**: `post-commit` 훅에서 `git push` 여부는 구분 불가. “커밋할 때마다” 알림이 감.
- **방법 B**: `post-commit` 대신 **별도 alias/스크립트**로 `git push` 실행 후 curl 호출 (권장).
- **방법 C**: Git 2.9+ 의 **push 후 훅**이 없으므로, `git push` 래퍼 스크립트를 만들어 push 후 Dooray 호출.

아래는 **push 후에 실행되는 래퍼 스크립트** 예시다. 이 스크립트로 push하면 두레이로 알림이 간다.

```bash
#!/bin/bash
# usage: ./scripts/git-push-with-notify.sh [push args...]
# DOORAY_WEBHOOK_URL 환경변수 필수

if [ -z "$DOORAY_WEBHOOK_URL" ]; then
    echo "DOORAY_WEBHOOK_URL not set. Skip Dooray notification."
    exec git push "$@"
    exit
fi

git push "$@"
PUSH_EXIT=$?

if [ $PUSH_EXIT -eq 0 ]; then
    REPO=$(basename -s .git "$(git config --get remote.origin.url 2>/dev/null)" 2>/dev/null || echo "repo")
    BRANCH=$(git branch --show-current)
    BODY=$(cat <<EOF
{
    "botName": "Git 알림",
    "text": "푸시 완료",
    "attachments": [{
        "title": "Push 성공",
        "text": "저장소: $REPO\n브랜치: $BRANCH",
        "color": "green"
    }]
}
EOF
)
    curl -s -X POST "$DOORAY_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$BODY" > /dev/null
fi

exit $PUSH_EXIT
```

- 사용: `./scripts/git-push-with-notify.sh` 또는 `./scripts/git-push-with-notify.sh origin main`
- 환경변수: `DOORAY_WEBHOOK_URL` 에 1단계에서 복사한 URL 설정.

**로컬에서 “변경사항 있음”만 알리고 싶다면** (push 없이) `post-commit` 훅에서 동일한 curl로 “커밋 완료: repo, branch, commit hash” 정도만 보내도록 구성할 수 있다.

---

## 4. 원격 저장소에 push가 있을 때 (GitHub Actions)

팀원이 push했을 때도 두레이로 알림을 받으려면 **GitHub Actions**를 사용한다.  
push 이벤트 시 워크플로가 Dooray Incoming Webhook URL로 POST하면 된다.

### 4.1 저장소에 시크릿 추가

- GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret** 추가: 이름 `DOORAY_WEBHOOK_URL`, 값에 1단계에서 복사한 URL

### 4.2 워크플로 파일

`.github/workflows/dooray-push-notify.yml` 예시:

```yaml
name: Dooray push notification
on:
    push:
        branches: [main, master]
jobs:
    notify:
        runs-on: ubuntu-latest
        steps:
            - name: Notify Dooray
              env:
                  DOORAY_WEBHOOK_URL: ${{ secrets.DOORAY_WEBHOOK_URL }}
              run: |
                  if [ -z "$DOORAY_WEBHOOK_URL" ]; then exit 0; fi
                  REPO="${{ github.repository }}"
                  BRANCH="${GITHUB_REF#refs/heads/}"
                  COMMIT="${{ github.sha }}"
                  MSG="${{ github.event.head_commit.message }}"
                  ACTOR="${{ github.actor }}"
                  BODY=$(cat <<EOF
                  {
                      "botName": "Git 알림",
                      "text": "새 푸시",
                      "attachments": [{
                          "title": "Push: $REPO",
                          "text": "브랜치: $BRANCH\n작성자: $ACTOR\n커밋: ${COMMIT::7}\n메시지: $MSG",
                          "color": "blue"
                      }]
                  }
                  EOF
                  )
                  curl -s -X POST "$DOORAY_WEBHOOK_URL" \
                      -H "Content-Type: application/json" \
                      -d "$BODY"
```

- `branches`를 필요한 브랜치로 수정해 사용하면 된다.

---

## 5. Dooray 메시지 형식 (참고)

Incoming Webhook으로 보낼 수 있는 JSON 예시:

```json
{
    "botName": "봇 이름",
    "botIconImage": "https://static.dooray.com/static_images/dooray-bot.png",
    "text": "메시지 제목",
    "attachments": [{
        "title": "제목",
        "text": "본문",
        "color": "red"
    }]
}
```

- `color`: red, green, blue 등
- 자세한 필드는 두레이 헬프데스크(서비스 연동·Incoming) 문서 참고.

---

## 6. 정리

- **로컬 push 시 알림**: 두레이 Incoming URL 발급 후, `git push` 래퍼 스크립트에서 push 성공 시 curl로 POST (위 3.2).
- **원격 push 시 알림**: 같은 URL을 GitHub Actions 시크릿에 등록하고, push 시 워크플로에서 curl로 POST (위 4).
- Webhook URL은 반드시 비밀로 유지하고, 저장소에는 커밋하지 않는다.
