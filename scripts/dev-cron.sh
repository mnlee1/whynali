#!/bin/bash
# dev-cron.sh
# 로컬 개발 서버용 Cron 시뮬레이터
# vercel.json 스케줄 기준으로 주요 cron을 자동 호출합니다.

BASE_URL="http://localhost:3000"
CRON_SECRET=$(grep "^CRON_SECRET=" "$(dirname "$0")/../.env.local" 2>/dev/null | cut -d '=' -f2)
CRON_SECRET=${CRON_SECRET:-"local-test-secret-key"}

# 서버 준비될 때까지 대기
echo "⏳ 로컬 서버 시작 대기 중..."
until curl -s "$BASE_URL" > /dev/null 2>&1; do
    sleep 2
done
echo "✅ 서버 준비 완료. Cron 시뮬레이터 시작."
echo "   커뮤니티 수집: 5분마다"
echo "   화력 재계산:   10분마다"
echo "   Track A:       30분마다 (첫 실행: 1분 후)"
echo ""

# 커뮤니티 수집 (5분마다)
collect_community() {
    while true; do
        echo "[$(date '+%H:%M:%S')] 📡 커뮤니티 수집..."
        curl -s -X GET "$BASE_URL/api/cron/collect-community" \
            -H "Authorization: Bearer $CRON_SECRET" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    sites = ['theqoo','natePann','clien','bobaedream','ruliweb','ppomppu']
    total = sum(d.get(s, {}).get('collected', 0) for s in sites)
    print(f'   → 수집 {total}건')
except: print('   → 완료')
" 2>/dev/null || echo "   → 완료"
        sleep 300
    done
}

# 화력 재계산 (10분마다)
recalculate_heat() {
    sleep 30
    while true; do
        echo "[$(date '+%H:%M:%S')] 🔥 화력 재계산..."
        curl -s -X GET "$BASE_URL/api/cron/recalculate-heat" \
            -H "Authorization: Bearer $CRON_SECRET" > /dev/null
        echo "   → 완료"
        sleep 600
    done
}

# Track A (30분마다, 첫 실행은 1분 후)
track_a() {
    sleep 60
    while true; do
        echo "[$(date '+%H:%M:%S')] 🚀 Track A 실행..."
        curl -s -X POST "$BASE_URL/api/cron/track-a" \
            -H "Authorization: Bearer $CRON_SECRET" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    created = d.get('created', 0)
    skipped = d.get('skipped', 0)
    print(f'   → 이슈 생성 {created}건, 스킵 {skipped}건')
except: print('   → 완료')
" 2>/dev/null || echo "   → 완료"
        sleep 1800
    done
}

collect_community &
recalculate_heat &
track_a &

wait
