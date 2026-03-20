/**
 * supabase/migrations/add_shortform_ai_validation.sql
 *
 * 숏폼 job에 AI 이미지 적합성 판별 결과 컬럼 추가
 *
 * 용도:
 * - 생성된 이미지가 플랫폼 정책에 적합한지 AI로 사전 검증
 * - 부적절한 콘텐츠(욕설, 혐오, 선정성 등) 자동 필터링
 * - 관리자 승인 전 사전 차단으로 운영 부담 감소
 */

ALTER TABLE shortform_jobs
    ADD COLUMN IF NOT EXISTS ai_validation jsonb;

COMMENT ON COLUMN shortform_jobs.ai_validation IS
    'AI 이미지 적합성 판별 결과: { status: pending|passed|flagged, reason: string, checked_at: string }';
