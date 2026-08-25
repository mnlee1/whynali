-- 홍보 채널 리포트에 "좋아요 수"/"댓글 수" 추가.
-- 유튜브(애널리틱스 API)·인스타그램(인사이트 API) 모두 기간을 직접 지정해서 조회 가능해서,
-- 조회수처럼 누적값 비교 계산이 필요 없이 바로 저장한다.

ALTER TABLE channel_promo_stats ADD COLUMN IF NOT EXISTS likes BIGINT;
ALTER TABLE channel_promo_stats ADD COLUMN IF NOT EXISTS comments BIGINT;
