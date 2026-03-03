-- 화력 30점 미만 이슈 정리
-- 테스트 과정에서 낮은 임계값(10점)으로 등록된 저품질 이슈 삭제

-- 1. 삭제 대상 확인
SELECT id, title, heat_index, category, created_at
FROM issues
WHERE heat_index < 30
ORDER BY heat_index ASC;

-- 2. 삭제 실행 (연결된 news_data, community_data의 issue_id를 NULL로 변경)
UPDATE news_data
SET issue_id = NULL
WHERE issue_id IN (
    SELECT id FROM issues WHERE heat_index < 30
);

UPDATE community_data
SET issue_id = NULL
WHERE issue_id IN (
    SELECT id FROM issues WHERE heat_index < 30
);

-- 3. 이슈 삭제
DELETE FROM issues
WHERE heat_index < 30;

-- 4. 결과 확인
SELECT 
    COUNT(*) as total_issues,
    AVG(heat_index) as avg_heat,
    MIN(heat_index) as min_heat,
    MAX(heat_index) as max_heat
FROM issues;
