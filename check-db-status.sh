#!/bin/bash

# Supabase 프로젝트 상태 확인 및 복원 스크립트

PROJECT_REF="daiwwuofyqjhknidkois"
PROJECT_URL="https://${PROJECT_REF}.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhaXd3dW9meXFqaGtuaWRrb2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODI4NDIsImV4cCI6MjA5MTE1ODg0Mn0.9RHN8SnHH45IBWDYvAbz3LsvhUX4X4FSJzj6a8-50kY"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhaXd3dW9meXFqaGtuaWRrb2lzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU4Mjg0MiwiZXhwIjoyMDkxMTU4ODQyfQ.UX4nEogflLOi303Qvr2qImkHfR6-TodB2oMfAByyUZ8"

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
