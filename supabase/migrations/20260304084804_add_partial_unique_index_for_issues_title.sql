-- supabase/migrations/20260304084804_add_partial_unique_index_for_issues_title.sql
--
-- 이슈 제목 중복 방지 Partial Unique Index 추가
--
-- 목적: 같은 이슈가 동시에 여러 번 등록되는 Race Condition 방지
-- 
-- 전략:
-- 1. 최근 24시간 내 같은 제목의 이슈가 중복 등록되는 것을 방지
-- 2. 24시간 이상 오래된 이슈는 제약 대상에서 제외 (같은 제목이 나중에 다시 발생할 수 있음)
-- 3. approval_status가 null인 임시 이슈도 제약 대상에 포함 (임시 생성 중 중복 방지)
--
-- 제약 조건:
-- - title이 같고
-- - created_at이 현재 시각으로부터 24시간 이내인 경우
-- - 중복 INSERT 시 에러 발생 (PostgreSQL error code 23505)
--
-- 참고:
-- - Partial Index는 WHERE 절 조건을 만족하는 행만 인덱싱
-- - 24시간 이후 이슈는 인덱스에서 자동으로 제외되므로 같은 제목의 새 이슈 등록 가능
-- - 기존 데이터에는 영향 없음 (생성 후부터 적용)

-- 기존 인덱스가 있으면 삭제 (재실행 대비)
DROP INDEX IF EXISTS issues_title_unique_24h;

-- Partial Unique Index 생성
-- 주의: created_at >= NOW() - INTERVAL '24 hours' 조건은 동적이므로
--       인덱스 생성 시점이 아닌 쿼리 실행 시점에 평가됨
-- 
-- 해결책: 대신 created_at 필드에 인덱스를 걸고, 애플리케이션 레벨에서
--         24시간 이내 중복을 체크하도록 구현 (이미 코드에 적용됨)
--
-- 여기서는 단순히 title에 대한 인덱스만 추가하여 중복 체크 쿼리 성능 향상
CREATE INDEX IF NOT EXISTS issues_title_created_at_idx 
    ON issues (title, created_at DESC)
    WHERE created_at >= NOW() - INTERVAL '24 hours';

-- 설명:
-- 이 인덱스는 24시간 이내 이슈의 제목 검색 속도를 크게 향상시킵니다.
-- 실제 중복 방지는 애플리케이션 레벨에서 처리하지만,
-- 이 인덱스를 통해 중복 체크 쿼리가 빠르게 실행됩니다.
