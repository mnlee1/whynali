-- 홍보 채널 리포트에 "공유 수" 추가 (좋아요·댓글과 동일한 방식 — 기간을 직접 지정해서 바로 조회).

ALTER TABLE channel_promo_stats ADD COLUMN IF NOT EXISTS shares BIGINT;
