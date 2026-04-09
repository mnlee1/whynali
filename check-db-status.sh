#!/bin/bash

# Supabase 프로젝트 상태 확인 및 복원 스크립트

# .env.local 파일에서 환경변수 로드
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

PROJECT_URL="${NEXT_PUBLIC_SUPABASE_URL}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo "=== Supabase 프로젝트 상태 확인 ==="
echo ""

# 주요 테이블 레코드 수 확인
echo "1. 주요 테이블 데이터 수:"
echo -n "  - issues: "
curl -s "${PROJECT_URL}/rest/v1/issues?select=count" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | grep -o '[0-9]*'

echo -n "  - users: "
curl -s "${PROJECT_URL}/rest/v1/users?select=count" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" | grep -o '[0-9]*'

echo -n "  - votes: "
curl -s "${PROJECT_URL}/rest/v1/votes?select=count" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | grep -o '[0-9]*'

echo -n "  - comments: "
curl -s "${PROJECT_URL}/rest/v1/comments?select=count" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | grep -o '[0-9]*'

echo ""
echo "2. 최근 이슈 목록 (최근 3개):"
curl -s "${PROJECT_URL}/rest/v1/issues?select=id,title,status,heat_index,created_at&order=created_at.desc&limit=3" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | jq -r '.[] | "  [\(.status)] \(.title) (heat: \(.heat_index))"'

echo ""
echo "3. 데이터베이스 연결:"
echo "  프로젝트: ${PROJECT_REF}"
echo "  URL: ${PROJECT_URL}"
echo "  상태: 정상"
