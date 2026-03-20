/**
 * lib/config/shortform-thresholds.ts
 * 
 * 숏폼 일간 배치 생성 임계값 단일 정의 파일.
 * process.env는 이 파일에서만 읽는다.
 * 배치는 daily-generate-content cron(매일 KST 정오)에서 실행된다.
 */

import type { HeatGrade } from '@/types/shortform'

/** 숏폼 배치 기능 활성화 여부 */
export const SHORTFORM_ENABLED = process.env.SHORTFORM_ENABLED === 'true'

/** 하루 최대 숏폼 job 생성 개수 (기본값 10개) */
export const SHORTFORM_DAILY_MAX = parseInt(
    process.env.SHORTFORM_DAILY_MAX ?? '10'
)

/** 숏폼 job 생성 최소 화력 지수 (기본값 30) */
export const SHORTFORM_MIN_HEAT = parseInt(
    process.env.SHORTFORM_MIN_HEAT ?? '30'
)

/** 숏폼 job 생성 최소 화력 등급 (기본값 '보통') */
export const SHORTFORM_MIN_HEAT_GRADE: HeatGrade = (
    process.env.SHORTFORM_MIN_HEAT_GRADE ?? '보통'
) as HeatGrade

/**
 * 동일 이슈 쿨다운 — 시간 단위 (기본값 20시간)
 * 같은 issueId로 pending/approved job이 이 시간 내 있으면 재생성 스킵.
 * 하루 1회 배치 기준 20시간으로 설정해 같은 날 중복 생성을 방지.
 */
export const SHORTFORM_COOLDOWN_HOURS = parseInt(
    process.env.SHORTFORM_COOLDOWN_HOURS ?? '20'
)

/** 숏폼 동영상 길이 (초 단위, 기본값 10초) */
export const SHORTFORM_VIDEO_DURATION = parseInt(
    process.env.SHORTFORM_VIDEO_DURATION ?? '10'
)

/** 숏폼 동영상 효과 (기본값 zoom_fade) */
export const SHORTFORM_VIDEO_EFFECT = (
    process.env.SHORTFORM_VIDEO_EFFECT ?? 'zoom_fade'
) as 'zoom_in' | 'zoom_out' | 'zoom_fade' | 'pan_left' | 'pan_right' | 'Ken_burns' | 'none'
