-- 내부 계정 플래그: KPI 집계에서 제외할 팀/테스트 계정 표시
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_internal ON users(is_internal);

-- 내부 계정 마킹 (팀원 본인/테스트 계정)
UPDATE users SET is_internal = true WHERE id IN (
  -- mnlee@nhnad.com (3개 계정)
  '1240323a-f089-4106-87ac-2a25d574217f', -- 운영자A
  'e759c4f1-43b6-4150-92f5-5f3cf699b8e8', -- 구글
  '89315ef5-8ee8-4177-abea-aef3b0febb00', -- 카카오
  -- mnlee 부계정 (lmn* 이메일)
  '0f5ffc2b-6825-4767-81d7-2ece8649ff1d', -- lmn64257260@gmail.com
  '0457f020-34d5-4a60-bba6-5184c2574ccb', -- lmn0726@hanmail.net
  '64c31011-e5fd-43c7-984a-f41d78db40a3', -- hi-share@naver.com
  -- jeongyun.seo@nhnad.com (3개 계정)
  '1dc4cd3d-fbd5-4781-a76e-1f7125ebdbe0', -- 운영자B
  'b92fde6c-cbcb-461c-abc1-615a4ab97b42', -- wjddbs9110@gmail.com
  '71eddfa8-a86f-4bbb-b2ef-701ad1a2511f', -- thddl9110@naver.com
  '05524577-45d3-4af4-8c37-1108bcf2d2a0', -- thddl9110@naver.com (카카오)
  -- 기타 운영 계정
  '90e0b1a9-319f-4770-9769-187a2fc0597d'  -- 운영자C (null provider)
  -- yeonjae.lee@nhnad.com, jungho.jung@nhnad.com 은 팀원이나 운영진 아님 → 제외
);
