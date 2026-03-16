-- ========================================
-- 이하늬 이슈 8개 → 1개 병합
-- ========================================

-- Primary 이슈 (화력 가장 높은 것)
-- ID: 57fcfe70-aa81-4325-a6ef-e605114c74df
-- 제목: "차은우 장어집, 이하늬 곰탕집"…식당에 기획사 차려 부동산 쇼핑하나
-- 화력: 7점

-- 1. 데이터 이전 (news_data)
UPDATE news_data 
SET issue_id = '57fcfe70-aa81-4325-a6ef-e605114c74df' 
WHERE issue_id IN (
    '07ebfb32-9fd8-426b-9cfb-e9dba071126d',
    'df39812c-2e96-4e85-9847-3a47d6ac7da1',
    'f11c627b-4c03-4b1b-9364-9951ecac8f21',
    'be153d42-0412-4b4f-bc64-f89e04f14802',
    '4c46d388-9a2e-4938-8f6a-93f8b6287c8f',
    'a1900e84-321d-40ad-b0e9-4e237f03db50',
    'de97a635-13c7-4eaf-b0ec-de24352b3deb'
);

-- 2. 데이터 이전 (community_data)
UPDATE community_data 
SET issue_id = '57fcfe70-aa81-4325-a6ef-e605114c74df' 
WHERE issue_id IN (
    '07ebfb32-9fd8-426b-9cfb-e9dba071126d',
    'df39812c-2e96-4e85-9847-3a47d6ac7da1',
    'f11c627b-4c03-4b1b-9364-9951ecac8f21',
    'be153d42-0412-4b4f-bc64-f89e04f14802',
    '4c46d388-9a2e-4938-8f6a-93f8b6287c8f',
    'a1900e84-321d-40ad-b0e9-4e237f03db50',
    'de97a635-13c7-4eaf-b0ec-de24352b3deb'
);

-- 3. Secondary 이슈 상태 변경
UPDATE issues 
SET approval_status = '병합됨', 
    merged_into_id = '57fcfe70-aa81-4325-a6ef-e605114c74df'
WHERE id IN (
    '07ebfb32-9fd8-426b-9cfb-e9dba071126d',
    'df39812c-2e96-4e85-9847-3a47d6ac7da1',
    'f11c627b-4c03-4b1b-9364-9951ecac8f21',
    'be153d42-0412-4b4f-bc64-f89e04f14802',
    '4c46d388-9a2e-4938-8f6a-93f8b6287c8f',
    'a1900e84-321d-40ad-b0e9-4e237f03db50',
    'de97a635-13c7-4eaf-b0ec-de24352b3deb'
);

-- 4. Primary 이슈 화력 재계산
UPDATE issues
SET heat_index = (
    SELECT COALESCE(SUM(heat_index), 0)
    FROM issues
    WHERE id = '57fcfe70-aa81-4325-a6ef-e605114c74df'
       OR merged_into_id = '57fcfe70-aa81-4325-a6ef-e605114c74df'
)
WHERE id = '57fcfe70-aa81-4325-a6ef-e605114c74df';

-- ========================================
-- 검증 쿼리
-- ========================================

-- 병합된 이슈 확인
SELECT title, approval_status, merged_into_id
FROM issues
WHERE id IN (
    '07ebfb32-9fd8-426b-9cfb-e9dba071126d',
    'df39812c-2e96-4e85-9847-3a47d6ac7da1',
    'f11c627b-4c03-4b1b-9364-9951ecac8f21',
    'be153d42-0412-4b4f-bc64-f89e04f14802',
    '4c46d388-9a2e-4938-8f6a-93f8b6287c8f',
    'a1900e84-321d-40ad-b0e9-4e237f03db50',
    'de97a635-13c7-4eaf-b0ec-de24352b3deb'
);

-- Primary 이슈 확인 (뉴스 개수, 화력)
SELECT 
    i.title,
    i.heat_index,
    COUNT(DISTINCT n.id) as news_count,
    COUNT(DISTINCT c.id) as community_count
FROM issues i
LEFT JOIN news_data n ON n.issue_id = i.id
LEFT JOIN community_data c ON c.issue_id = i.id
WHERE i.id = '57fcfe70-aa81-4325-a6ef-e605114c74df'
GROUP BY i.id, i.title, i.heat_index;
