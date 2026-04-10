#!/bin/bash

# .env.local에서 CRON_SECRET 읽기
CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f2)

if [ -z "$CRON_SECRET" ]; then
    echo "❌ CRON_SECRET을 .env.local에서 찾을 수 없습니다"
    exit 1
fi

echo "🔄 커뮤니티 수집 크론 수동 실행..."
echo ""

curl -X GET "https://whynali.com/api/cron/collect-community" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -v

echo ""
echo "✅ 완료"
