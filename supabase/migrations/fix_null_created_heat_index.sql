-- fix_null_created_heat_index.sql
-- created_heat_index가 null인 이슈들을 현재 화력으로 업데이트

UPDATE issues
SET created_heat_index = heat_index
WHERE created_heat_index IS NULL
  AND heat_index IS NOT NULL;

-- 결과 확인용 주석
-- SELECT COUNT(*) FROM issues WHERE created_heat_index IS NULL;
