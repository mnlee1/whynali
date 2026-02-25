-- supabase/migrations/add_issue_candidates_table.sql
--
-- issue_candidates 테이블 생성
--
-- Perplexity AI 전처리 필터 결과를 저장하는 테이블.
-- 1단계(메타데이터 사전 필터) + 2단계(AI 점수화)를 통과한
-- 이슈 후보만 저장되며, 7점 이상인 건들이 여기에 기록된다.
-- status='promoted'가 되면 기존 issues 테이블 대기 등록으로 이어진다.

CREATE TABLE IF NOT EXISTS issue_candidates (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

    -- 이슈 대표 제목 (그룹 내 첫 번째 수집 건 제목)
    title           text        NOT NULL,

    -- 수집 출처 구분: 'news' | 'community' | 'mixed'
    source_type     text        NOT NULL DEFAULT 'mixed',

    -- 관련 news_data, community_data ID 배열
    news_ids        uuid[]      NOT NULL DEFAULT '{}',
    community_ids   uuid[]      NOT NULL DEFAULT '{}',

    -- Perplexity AI 평가 결과
    ai_score        int2        NOT NULL CHECK (ai_score BETWEEN 0 AND 10),
    ai_category     text        NOT NULL,  -- 연예 | 스포츠 | 정치 | 사회 | 기술
    ai_reason       text,                  -- 점수 근거 (관리자 참고용)

    -- 처리 상태
    -- pending   : AI 점수화 완료, 아직 issues 연결 안 됨
    -- promoted  : issues 테이블 대기 등록 완료
    -- dismissed : 중복 또는 수동 제거
    status          text        NOT NULL DEFAULT 'pending',

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 최근 중복 제목 체크용 인덱스 (24시간 내 같은 제목 재등록 방지)
CREATE INDEX IF NOT EXISTS idx_issue_candidates_title_created
    ON issue_candidates (title, created_at DESC);

-- 상태별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_issue_candidates_status
    ON issue_candidates (status, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_issue_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_candidates_updated_at ON issue_candidates;
CREATE TRIGGER trg_issue_candidates_updated_at
    BEFORE UPDATE ON issue_candidates
    FOR EACH ROW EXECUTE FUNCTION update_issue_candidates_updated_at();
