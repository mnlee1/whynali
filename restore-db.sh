#!/bin/bash

# Supabase 프로젝트 복원 스크립트
# 사용법: ./restore-db.sh

PROJECT_REF="daiwwuofyqjhknidkois"
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_USER="postgres"
DB_NAME="postgres"
DEV_SETUP_FILE="supabase/dev_setup.sql"

echo "Supabase 프로젝트 복원을 시작합니다..."
echo "프로젝트: ${PROJECT_REF}"
echo ""

# 비밀번호 입력 받기
echo "데이터베이스 비밀번호를 입력하세요:"
read -s DB_PASSWORD

echo ""
echo "데이터베이스 연결 중..."

# dev_setup.sql 실행
PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -f "${DEV_SETUP_FILE}"

if [ $? -eq 0 ]; then
    echo ""
    echo "복원이 완료되었습니다!"
else
    echo ""
    echo "복원 중 오류가 발생했습니다."
    exit 1
fi
