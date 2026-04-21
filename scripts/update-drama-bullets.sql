-- '[테스트] 드라마 촬영장 스태프 사망 사고 발생' 이슈의 불릿 포인트를 5개로 업데이트

-- 1. 먼저 이슈 ID 확인
SELECT id, title 
FROM issues 
WHERE title LIKE '%드라마 촬영장 스태프 사망%'
LIMIT 1;

-- 위에서 받은 id를 복사해서 아래 <issue-id>에 붙여넣으세요

-- 2. 현재 타임라인 요약 확인
SELECT 
    stage,
    stage_title,
    bullets,
    jsonb_array_length(bullets) as 현재_불릿개수
FROM timeline_summaries
WHERE issue_id = '<issue-id>'
ORDER BY 
    CASE stage
        WHEN '발단' THEN 1
        WHEN '전개' THEN 2
        WHEN '파생' THEN 3
        WHEN '진정' THEN 4
    END;

-- 3. 불릿 포인트를 5개로 업데이트 (발단)
UPDATE timeline_summaries
SET bullets = '[
    "드라마 촬영장에서 스태프 사망 사고가 발생했다",
    "현장 안전 관리 문제 가능성으로 추정된다",
    "경찰과 고용노동부가 합동 조사에 착수했다",
    "촬영 중단 및 관계자 조사가 진행되었다",
    "유가족이 철저한 진상 규명을 요구했다"
]'::jsonb,
summary = '드라마 촬영장에서 스태프 사망 사고가 발생했다 현장 안전 관리 문제 가능성으로 추정된다 경찰과 고용노동부가 합동 조사에 착수했다 촬영 중단 및 관계자 조사가 진행되었다 유가족이 철저한 진상 규명을 요구했다',
generated_at = NOW()
WHERE issue_id = '<issue-id>' AND stage = '발단';

-- 4. 전개 단계도 5개로 업데이트
UPDATE timeline_summaries
SET bullets = '[
    "촬영사가 입장문을 발표하고 재발 방지 대책을 약속했다",
    "드라마·영화 업계 전반의 안전 관리 문제가 재조명되었다",
    "시민 단체들이 촬영장 안전 기준 강화를 요구했다",
    "국회의원들이 현장 근로자 안전 강화 법안 발의를 예고했다",
    "유사 사례들이 SNS에서 공유되며 관심이 집중되었다"
]'::jsonb,
summary = '촬영사가 입장문을 발표하고 재발 방지 대책을 약속했다 드라마·영화 업계 전반의 안전 관리 문제가 재조명되었다 시민 단체들이 촬영장 안전 기준 강화를 요구했다 국회의원들이 현장 근로자 안전 강화 법안 발의를 예고했다 유사 사례들이 SNS에서 공유되며 관심이 집중되었다',
generated_at = NOW()
WHERE issue_id = '<issue-id>' AND stage = '전개';

-- 5. 파생 단계도 4개로 업데이트
UPDATE timeline_summaries
SET bullets = '[
    "방송·영화 제작 현장의 열악한 근로 환경이 화두가 되었다",
    "다른 제작사들도 자체 안전 점검에 나섰다",
    "업계 종사자들이 온라인에서 현장 실태를 폭로했다",
    "정부가 전수 조사 및 관리 감독 강화를 예고했다"
]'::jsonb,
summary = '방송·영화 제작 현장의 열악한 근로 환경이 화두가 되었다 다른 제작사들도 자체 안전 점검에 나섰다 업계 종사자들이 온라인에서 현장 실태를 폭로했다 정부가 전수 조사 및 관리 감독 강화를 예고했다',
generated_at = NOW()
WHERE issue_id = '<issue-id>' AND stage = '파생';

-- 6. 결과 확인
SELECT 
    stage,
    stage_title,
    jsonb_array_length(bullets) as 불릿개수,
    bullets
FROM timeline_summaries
WHERE issue_id = '<issue-id>'
ORDER BY 
    CASE stage
        WHEN '발단' THEN 1
        WHEN '전개' THEN 2
        WHEN '파생' THEN 3
        WHEN '진정' THEN 4
    END;
