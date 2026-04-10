-- reset-api-usage-monthly.sql
-- 
-- 현재 월 API 사용 현황 초기화 (선택 사항)
-- 
-- 사용 시나리오:
-- - 매월 1일 대시보드의 "오류 8건" 같은 누적 카운트를 초기화하고 싶을 때
-- - 월간 아카이빙 후 현재 월 데이터만 유지하고 싶을 때
--
-- ⚠️ 주의사항:
-- - 이 스크립트는 현재 월의 api_usage 데이터를 삭제합니다
-- - 실행 전 반드시 백업을 확인하세요
-- - 자동 백업은 매일 오전 9시에 실행됩니다 (백업 확인: npm run backup)
--
-- 사용법:
-- 1. Supabase Dashboard > SQL Editor 접속
-- 2. STEP 1 실행하여 삭제될 데이터 확인
-- 3. 문제 없으면 STEP 2 주석 해제 후 실행
-- 4. STEP 3으로 결과 확인

-- STEP 1: 현재 월 데이터 확인 (삭제 전 확인)
SELECT 
    api_name,
    date,
    call_count,
    success_count,
    fail_count
FROM api_usage
WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY date DESC, api_name;

-- STEP 2: 현재 월 데이터 삭제 (실행하려면 주석 해제)
-- DELETE FROM api_usage
-- WHERE date >= DATE_TRUNC('month', CURRENT_DATE);

-- STEP 3: 결과 확인 (삭제 후 남은 데이터 개수 확인)
-- SELECT COUNT(*) as remaining_count
-- FROM api_usage
-- WHERE date >= DATE_TRUNC('month', CURRENT_DATE);
