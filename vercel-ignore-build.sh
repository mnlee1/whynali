#!/usr/bin/env bash
# Vercel Ignored Build Step 스크립트
# exit 0 = 빌드 스킵, exit 1 = 빌드 진행

if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
    exit 0
fi

if echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -qE '\[vercel skip\]|\[skip ci\]|\[skip deploy\]'; then
    exit 0
fi

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
    # 직전 배포 커밋을 알 수 없으면(최초 배포 등) 변경 여부를 판단할 수 없으므로 안전하게 빌드 진행
    exit 1
fi

CHANGED=$(git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" HEAD 2>/dev/null)
if [ $? -ne 0 ]; then
    # diff 계산 자체가 실패하면(얕은 클론 등으로 커밋을 못 찾는 경우) 변경사항을 못 미더워하지 말고 빌드 진행
    exit 1
fi

if [ -z "$CHANGED" ]; then
    exit 0
fi

if echo "$CHANGED" | grep -qv '^backups/'; then
    exit 1
fi

exit 0
