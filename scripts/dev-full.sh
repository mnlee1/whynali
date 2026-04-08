#!/bin/bash
# dev-full.sh
# Next.js 개발 서버 + Cron 시뮬레이터를 함께 실행합니다.
# Ctrl+C 하면 둘 다 종료됩니다.

trap 'echo ""; echo "🛑 종료 중..."; kill 0' EXIT INT TERM

SCRIPT_DIR="$(dirname "$0")"

npm run dev &
bash "$SCRIPT_DIR/dev-cron.sh" &

wait
