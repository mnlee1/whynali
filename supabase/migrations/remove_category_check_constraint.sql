/**
 * 마이그레이션: 카테고리 CHECK 제약 제거
 * 
 * 목적: 카테고리 시스템을 확장 가능하도록 개선
 * - 기존 5개 고정 카테고리(연예/스포츠/정치/사회/기술) CHECK 제약 제거
 * - 애플리케이션 레벨에서 동적으로 카테고리 관리
 * - DB 마이그레이션 없이 새 카테고리 추가 가능
 * 
 * 주의: 
 * - 이 마이그레이션 후에는 애플리케이션 코드에서 카테고리 유효성 검증 필요
 * - lib/config/categories.ts 파일에서 카테고리 추가/수정
 */

-- issues 테이블 카테고리 CHECK 제약 제거
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_category_check;

-- news_data 테이블 카테고리 CHECK 제약 제거 (있는 경우)
ALTER TABLE news_data DROP CONSTRAINT IF EXISTS news_data_category_check;

-- 새로운 카테고리 추가 시 기본값 처리를 위한 주석
COMMENT ON COLUMN issues.category IS '이슈 카테고리 (lib/config/categories.ts에서 정의)';
COMMENT ON COLUMN news_data.category IS '뉴스 카테고리 (lib/config/categories.ts에서 정의)';
