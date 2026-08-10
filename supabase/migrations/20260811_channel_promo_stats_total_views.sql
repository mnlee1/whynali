-- 유튜브 "전체 누적 조회수" 스냅샷 저장용 컬럼 추가.
-- 유튜브는 API로 "지금까지 전체 조회수"만 가져올 수 있어서(기간별 조회수 API는 없음),
-- 매번 가져온 누적 조회수를 여기 저장해두고, 다음 번 값과 비교해서 "이번 기간 발생 조회수"를 계산한다.
-- (기존 total_subscribers/new_subscribers와 같은 방식)

ALTER TABLE channel_promo_stats ADD COLUMN IF NOT EXISTS total_views BIGINT;
