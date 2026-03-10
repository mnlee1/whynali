#!/bin/bash

# 여러 카테고리를 순차적으로 재분류하는 스크립트
# 
# 사용법:
# chmod +x scripts/reclassify-all.sh
# ./scripts/reclassify-all.sh --dry-run  # 테스트
# ./scripts/reclassify-all.sh             # 실제 적용

DRY_RUN=""
LIMIT="--limit 100"

# 인자 파싱
for arg in "$@"
do
    case $arg in
        --dry-run)
        DRY_RUN="--dry-run"
        shift
        ;;
        --limit)
        LIMIT="--limit $2"
        shift
        shift
        ;;
        --no-limit)
        LIMIT=""
        shift
        ;;
    esac
done

echo "======================================"
echo "전체 카테고리 재분류 시작"
echo "======================================"
echo ""

if [ -n "$DRY_RUN" ]; then
    echo "⚠️  DRY RUN 모드 - 실제 변경 없음"
else
    echo "🔥 실제 적용 모드 - DB 업데이트됨"
fi

if [ -n "$LIMIT" ]; then
    echo "📊 제한: 각 카테고리당 100개"
else
    echo "📊 제한: 없음 (전체)"
fi

echo ""
echo "======================================"
echo ""

# 카테고리 목록
categories=("스포츠" "연예" "사회" "정치" "기술")

# 각 카테고리 순차 처리
for category in "${categories[@]}"
do
    echo ""
    echo "======================================"
    echo "🏷️  카테고리: $category"
    echo "======================================"
    echo ""
    
    npx tsx scripts/reclassify-issues.ts --category "$category" $DRY_RUN $LIMIT
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 에러 발생: $category 카테고리 처리 실패"
        echo "계속 진행합니다..."
    fi
    
    echo ""
    echo "⏸️  다음 카테고리 전 5초 대기..."
    sleep 5
done

echo ""
echo "======================================"
echo "✅ 전체 카테고리 재분류 완료"
echo "======================================"
echo ""
echo "관리자 페이지에서 결과를 확인하세요:"
echo "https://whynali.vercel.app/admin/issues"
