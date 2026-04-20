-- 이슈에 주제 및 주제 설명 필드 추가
-- 메인 이슈 목록에서 사용

ALTER TABLE issues
ADD COLUMN topic VARCHAR(50),
ADD COLUMN topic_description VARCHAR(300);

-- 기존 이슈에는 NULL 허용
-- 신규 이슈는 Track A에서 생성 시 자동 입력

COMMENT ON COLUMN issues.topic IS '이슈 주제 (예: "옥택연 결혼", "갤럭시 S26 공개")';
COMMENT ON COLUMN issues.topic_description IS '이슈 주제 설명 2~3줄 (메인 목록용)';
