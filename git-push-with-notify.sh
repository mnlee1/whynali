#!/bin/bash
# Git push 후 두레이 메신저 알림 전송
# usage: ./scripts/git-push-with-notify.sh [push 인자...]
# DOORAY_WEBHOOK_URL 환경변수에 Incoming Webhook URL 설정 필요

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
