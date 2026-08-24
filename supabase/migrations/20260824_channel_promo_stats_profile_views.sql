-- 틱톡 "프로필 조회수" 수동 입력용 컬럼 추가.
-- 틱톡 스튜디오 분석 화면에 동영상 조회수와 별도로 표시되는 지표라 따로 저장한다.

ALTER TABLE channel_promo_stats ADD COLUMN IF NOT EXISTS profile_views BIGINT;
