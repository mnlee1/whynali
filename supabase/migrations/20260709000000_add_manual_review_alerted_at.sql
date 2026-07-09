/**
 * 수동승인 대기 이슈 두레이 알림 중복 방지
 *
 * 연예/정치 등 AUTO_APPROVE_CATEGORIES 미포함 카테고리 이슈가
 * 화력 30점을 넘으면 관리자에게 즉시 알림을 보낸다.
 * recalculate-heat 크론이 10분마다 재계산하므로, 이미 알림을 보낸
 * 이슈에 다시 보내지 않도록 알림 발송 시각을 기록한다.
 */

ALTER TABLE issues
ADD COLUMN manual_review_alerted_at TIMESTAMPTZ;

COMMENT ON COLUMN issues.manual_review_alerted_at IS '수동승인 필요 이슈의 화력 30점 초과 두레이 알림 발송 시각 (중복 알림 방지)';
