#!/usr/bin/env bash
# Vercel Ignored Build Step 스크립트
# exit 0 = 빌드 스킵, exit 1 = 빌드 진행

if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
    exit 0
fi

if echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -qE '\[vercel skip\]|\[skip ci\]|\[skip deploy\]'; then
    exit 0
fi

CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
    exit 0
fi

if echo "$CHANGED" | grep -qv '^backups/'; then
    exit 1
fi

exit 0
