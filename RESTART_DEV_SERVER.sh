#!/bin/bash
# Next.js 개발 서버 재시작 스크립트

echo "1. 실행 중인 Next.js 프로세스 종료..."
pkill -f "next dev" || echo "실행 중인 프로세스 없음"

sleep 2

echo "2. .next 빌드 캐시 삭제..."
rm -rf .next

echo "3. 개발 서버 시작..."
npm run dev
