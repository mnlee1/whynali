-- 009_cleanup_legacy_issues.sql
-- 트랙 A 기본화에 따른 레거시 이슈 정리
-- 작성일: 2026-03-13

-- 1. 삭제 대상 확인 (실행 전 확인용)
DO $$
DECLARE
    legacy_count INTEGER;
    track_a_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO legacy_count FROM issues WHERE source_track IS NULL OR source_track != 'track_a';
    SELECT COUNT(*) INTO track_a_count FROM issues WHERE source_track = 'track_a';
    
    RAISE NOTICE '이슈 정리 시작';
    RAISE NOTICE '트랙 A 이슈: % 건 (유지)', track_a_count;
    RAISE NOTICE '레거시 이슈: % 건 (삭제 예정)', legacy_count;
END $$;

-- 2. 레거시 이슈와 연결된 뉴스/커뮤니티 데이터 연결 해제
UPDATE news_data
SET issue_id = NULL
WHERE issue_id IN (
    SELECT id FROM issues 
    WHERE source_track IS NULL OR source_track != 'track_a'
);

UPDATE community_data
SET issue_id = NULL
WHERE issue_id IN (
    SELECT id FROM issues 
    WHERE source_track IS NULL OR source_track != 'track_a'
);

-- 3. 타임라인 포인트 삭제 (외래 키 제약 때문에 먼저 삭제)
DELETE FROM timeline_points
WHERE issue_id IN (
    SELECT id FROM issues 
    WHERE source_track IS NULL OR source_track != 'track_a'
);

-- 4. 토론 주제 삭제 (있다면)
DELETE FROM discussions
WHERE issue_id IN (
    SELECT id FROM issues 
    WHERE source_track IS NULL OR source_track != 'track_a'
);

-- 5. 투표 삭제 (있다면)
DELETE FROM votes
WHERE issue_id IN (
    SELECT id FROM issues 
    WHERE source_track IS NULL OR source_track != 'track_a'
);

-- 6. 레거시 이슈 삭제
DELETE FROM issues
WHERE source_track IS NULL OR source_track != 'track_a';

-- 7. 결과 확인
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count FROM issues;
    RAISE NOTICE '정리 완료';
    RAISE NOTICE '남은 이슈: % 건 (모두 트랙 A)', remaining_count;
END $$;
