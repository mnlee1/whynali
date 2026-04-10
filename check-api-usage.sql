-- check-api-usage.sql
-- 
-- AI API 사용 현황 조회 (Supabase SQL Editor에서 실행)
-- Claude와 Groq의 성공/실패 건수 확인
--
-- 사용법:
-- 1. Supabase Dashboard > SQL Editor 접속
-- 2. 이 쿼리 복사/붙여넣기
-- 3. 날짜 범위 수정 필요시 WHERE 절의 '2026-04-01' 변경

-- 일별 상세 현황
SELECT 
    api_name,
    date,
    call_count,
    success_count,
    fail_count,
    CASE 
        WHEN call_count > 0 THEN ROUND((fail_count::numeric / call_count::numeric) * 100, 2)
        ELSE 0 
    END as fail_rate_percent
FROM api_usage
WHERE api_name IN ('claude', 'groq')
    AND date >= '2026-04-01'
ORDER BY date DESC, api_name;

-- 월별 집계
SELECT 
    api_name,
    SUM(call_count) as total_calls,
    SUM(success_count) as total_successes,
    SUM(fail_count) as total_failures,
    CASE 
        WHEN SUM(call_count) > 0 THEN ROUND((SUM(fail_count)::numeric / SUM(call_count)::numeric) * 100, 2)
        ELSE 0 
    END as fail_rate_percent
FROM api_usage
WHERE api_name IN ('claude', 'groq')
    AND date >= '2026-04-01'
GROUP BY api_name
ORDER BY api_name;
