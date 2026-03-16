-- 화력 15점 미만 이슈 방지 및 source_track NULL 방지
-- 날짜: 2026-03-16

-- 1. source_track이 NULL이면 자동으로 'track_a'로 설정
CREATE OR REPLACE FUNCTION set_default_source_track()
RETURNS TRIGGER AS $$
BEGIN
    -- source_track이 NULL이면 'track_a'로 설정
    IF NEW.source_track IS NULL THEN
        NEW.source_track := 'track_a';
        RAISE WARNING 'source_track이 NULL이어서 track_a로 자동 설정됨: %', NEW.title;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (이슈 INSERT 시)
DROP TRIGGER IF EXISTS trigger_set_default_source_track ON issues;
CREATE TRIGGER trigger_set_default_source_track
    BEFORE INSERT ON issues
    FOR EACH ROW
    EXECUTE FUNCTION set_default_source_track();

-- 2. 화력 15점 미만 이슈 생성 방지 (created_heat_index 기준)
CREATE OR REPLACE FUNCTION prevent_low_heat_creation()
RETURNS TRIGGER AS $$
BEGIN
    -- created_heat_index가 설정되고 15점 미만이면 에러
    IF NEW.created_heat_index IS NOT NULL AND NEW.created_heat_index < 15 THEN
        RAISE EXCEPTION '화력 15점 미만 이슈는 생성할 수 없습니다. 현재 화력: %점', NEW.created_heat_index;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (이슈 INSERT 시)
DROP TRIGGER IF EXISTS trigger_prevent_low_heat_creation ON issues;
CREATE TRIGGER trigger_prevent_low_heat_creation
    BEFORE INSERT ON issues
    FOR EACH ROW
    EXECUTE FUNCTION prevent_low_heat_creation();

-- 3. 기존 비정상 이슈 정리 (선택적)
-- source_track이 NULL인 이슈 삭제 (수동 실행)
-- DELETE FROM issues WHERE source_track IS NULL;

COMMENT ON FUNCTION set_default_source_track() IS '이슈 생성 시 source_track이 NULL이면 track_a로 자동 설정';
COMMENT ON FUNCTION prevent_low_heat_creation() IS '화력 15점 미만 이슈 생성 방지 (created_heat_index 기준)';
