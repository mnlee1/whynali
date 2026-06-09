-- 종결 시점 화력 스냅샷 컬럼 추가
-- 이슈가 '종결' 상태로 전환될 때 당시의 heat_index를 기록.
-- 이후 heat_index는 재점화 감지용으로만 재계산되어 값이 변할 수 있으므로
-- 관리자 UI에서는 종결 이슈의 "현재 화력" 대신 이 값을 표시한다.
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS heat_at_close INTEGER;

-- 기존 종결 이슈: 현재 heat_index를 종결 시 화력으로 소급 적용
-- (실제 종결 당시 값과 차이가 있을 수 있으나 최선의 근사값)
UPDATE issues
SET heat_at_close = heat_index
WHERE status = '종결'
  AND heat_at_close IS NULL
  AND heat_index IS NOT NULL;
