-- 불릿 3~5개짜리 타임라인 테스트 데이터 생성
-- Supabase SQL Editor에서 실행하세요

-- 1. 테스트 이슈 생성
INSERT INTO issues (
    title,
    description,
    status,
    category,
    approval_status,
    visibility_status,
    heat_index,
    source_track
) VALUES (
    '[테스트] 불릿 포인트 테스트 이슈',
    '타임라인 불릿 포인트 UI 테스트용',
    '논란중',
    '사회',
    '승인',
    'visible',
    50,
    'track_a'
) RETURNING id;

-- 위에서 반환된 id를 복사해서 아래 <issue-id>에 붙여넣으세요

-- 2. 타임라인 요약 데이터 생성 (불릿 3~5개)
INSERT INTO timeline_summaries (
    issue_id,
    stage,
    stage_title,
    bullets,
    summary,
    date_start,
    date_end,
    generated_at
) VALUES
-- 발단: 불릿 3개
(
    '<issue-id>',
    '발단',
    '사건 발생',
    '["대전 오월드에서 어린 녹대 녹구가 우리 밖으로 탈출했다","정확한 원인은 사육 관리 문제 가능성으로 추정된다","야생성이 남아 있어 안전 우려가 제기되었다"]'::jsonb,
    '대전 오월드에서 어린 녹대 녹구가 우리 밖으로 탈출했다 정확한 원인은 사육 관리 문제 가능성으로 추정된다 야생성이 남아 있어 안전 우려가 제기되었다',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days',
    NOW()
),
-- 전개: 불릿 5개
(
    '<issue-id>',
    '전개',
    '수색과 대응',
    '["탈출 직후부터 대전 일대 수색 작전이 진행되었다","드론·열화상 카메라 등 동원해 위치 추적에 나섰다","시민 제보 이어지며 SNS에서 목격담 확산되었다","동물원 측이 공식 사과하고 관리 소홀을 인정했다","온라인에서 녹구 찾기 및 확산"]'::jsonb,
    '탈출 직후부터 대전 일대 수색 작전이 진행되었다 드론·열화상 카메라 등 동원해 위치 추적에 나섰다 시민 제보 이어지며 SNS에서 목격담 확산되었다 동물원 측이 공식 사과하고 관리 소홀을 인정했다 온라인에서 녹구 찾기 및 확산',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day',
    NOW()
),
-- 파생: 불릿 4개
(
    '<issue-id>',
    '파생',
    '안전 관리 논란',
    '["녹구가 경기 포획되자 않으면서 동물원 안전 관리 체계에 대한 논란이 확산되었다","SNS·커뮤니티에서 법령 형성 → 국민 녹대 벌써 등장","전광판 오전 관리 문제, 야생동물 관리 제계에 대한 논평 촉발","동물원 안전 관리 문제가 사회적 이슈로 대두되었다"]'::jsonb,
    '녹구가 경기 포획되자 않으면서 동물원 안전 관리 체계에 대한 논란이 확산되었다 SNS·커뮤니티에서 법령 형성 → 국민 녹대 벌써 등장 전광판 오전 관리 문제, 야생동물 관리 제계에 대한 논평 촉발 동물원 안전 관리 문제가 사회적 이슈로 대두되었다',
    NOW() - INTERVAL '1 day',
    NOW(),
    NOW()
);

-- 3. 생성된 이슈 ID 확인
SELECT id, title FROM issues WHERE title = '[테스트] 불릿 포인트 테스트 이슈';

-- 4. 타임라인 확인
SELECT 
    stage,
    stage_title,
    bullets,
    jsonb_array_length(bullets) as 불릿개수
FROM timeline_summaries
WHERE issue_id = '<issue-id>'
ORDER BY 
    CASE stage
        WHEN '발단' THEN 1
        WHEN '전개' THEN 2
        WHEN '파생' THEN 3
        WHEN '진정' THEN 4
    END;
