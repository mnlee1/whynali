/**
 * supabase/migrations/add_short_code.sql
 *
 * 이슈 테이블에 짧은 URL 코드 컬럼 추가
 * - short_code: 6자리 고유 코드 (예: aBc123)
 * - 기존 이슈에도 자동으로 코드 생성
 */

-- short_code 컬럼 추가
ALTER TABLE issues
ADD COLUMN short_code VARCHAR(8) UNIQUE;

-- short_code 인덱스 추가 (빠른 조회를 위해)
CREATE INDEX idx_issues_short_code ON issues(short_code);

-- 기존 이슈에 대해 짧은 코드 자동 생성 함수
CREATE OR REPLACE FUNCTION generate_short_code()
RETURNS TEXT AS $$
DECLARE
    characters TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER := 0;
    pos INTEGER;
BEGIN
    -- 6자리 랜덤 문자열 생성
    FOR i IN 1..6 LOOP
        pos := floor(random() * length(characters) + 1)::INTEGER;
        result := result || substr(characters, pos, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 기존 이슈에 짧은 코드 할당 (중복 체크하면서 생성)
DO $$
DECLARE
    issue_record RECORD;
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    FOR issue_record IN SELECT id FROM issues WHERE short_code IS NULL LOOP
        LOOP
            new_code := generate_short_code();
            
            -- 중복 체크
            SELECT EXISTS(SELECT 1 FROM issues WHERE short_code = new_code) INTO code_exists;
            
            -- 중복이 없으면 할당하고 루프 종료
            IF NOT code_exists THEN
                UPDATE issues SET short_code = new_code WHERE id = issue_record.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 새 이슈 생성 시 자동으로 short_code 생성하는 트리거 함수
CREATE OR REPLACE FUNCTION auto_generate_short_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
    max_attempts INTEGER := 50;  -- 10회에서 50회로 증가
    attempt INTEGER := 0;
BEGIN
    -- short_code가 이미 있으면 그대로 사용
    IF NEW.short_code IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- 최대 시도 횟수만큼 반복
    WHILE attempt < max_attempts LOOP
        new_code := generate_short_code();
        
        -- 중복 체크
        SELECT EXISTS(SELECT 1 FROM issues WHERE short_code = new_code) INTO code_exists;
        
        -- 중복이 없으면 할당하고 반환
        IF NOT code_exists THEN
            NEW.short_code := new_code;
            RETURN NEW;
        END IF;
        
        attempt := attempt + 1;
    END LOOP;

    -- 최대 시도 후에도 실패하면 경고 로그 남기고 NULL 반환 (에러 대신)
    -- 관리자가 나중에 수동으로 할당할 수 있도록 함
    RAISE WARNING 'Failed to generate unique short_code after % attempts for issue id=%', max_attempts, NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS trigger_auto_generate_short_code ON issues;
CREATE TRIGGER trigger_auto_generate_short_code
    BEFORE INSERT ON issues
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_short_code();

-- short_code를 NOT NULL로 변경 (모든 기존 이슈에 코드가 할당된 후)
ALTER TABLE issues
ALTER COLUMN short_code SET NOT NULL;
