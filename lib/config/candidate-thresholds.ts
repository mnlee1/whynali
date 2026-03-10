/**
 * lib/config/candidate-thresholds.ts
 * 
 * 이슈 후보 탐지·승인·반려에 사용되는 임계값 단일 정의 파일.
 * process.env는 이 파일에서만 읽는다.
 * 
 * 참조 파일:
 * - lib/candidate/issue-candidate.ts
 * - app/api/cron/recalculate-heat/route.ts
 * - app/api/admin/issues/route.ts
 */

export const CANDIDATE_ALERT_THRESHOLD = parseInt(
    process.env.CANDIDATE_ALERT_THRESHOLD ?? '5'
)
export const CANDIDATE_AUTO_APPROVE_THRESHOLD = parseInt(
    process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30'
)
export const CANDIDATE_MIN_HEAT_TO_REGISTER = parseInt(
    process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15'
)
export const CANDIDATE_WINDOW_HOURS = parseInt(
    process.env.CANDIDATE_WINDOW_HOURS ?? '24'
)
export const CANDIDATE_MIN_UNIQUE_SOURCES = parseInt(
    process.env.CANDIDATE_MIN_UNIQUE_SOURCES ?? '2'
)
export const CANDIDATE_NO_RESPONSE_HOURS = parseInt(
    process.env.CANDIDATE_NO_RESPONSE_HOURS ?? '6'
)
