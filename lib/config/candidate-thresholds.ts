/**
 * lib/config/candidate-thresholds.ts
 * 
 * [이슈 후보 평가 임계값 설정]
 * 
 * 이슈 후보 생성(issue-candidate.ts)과 화력 재계산(recalculate-heat/route.ts)에서
 * 공통으로 사용하는 환경변수 기반 임계값을 중앙 관리합니다.
 * 
 * 예시:
 * import { ALERT_THRESHOLD, AUTO_APPROVE_THRESHOLD } from '@/lib/config/candidate-thresholds'
 */

/**
 * 이슈 후보 등록 최소 뉴스 건수
 * 기본값: 5건
 */
export const CANDIDATE_ALERT_THRESHOLD = parseInt(process.env.CANDIDATE_ALERT_THRESHOLD ?? '5')

/**
 * 자동 승인 화력 임계값
 * 기본값: 30점
 */
export const CANDIDATE_AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30')

/**
 * 관리자 무응답 시간 (시간 단위)
 * 기본값: 6시간
 */
export const CANDIDATE_NO_RESPONSE_HOURS = parseInt(process.env.CANDIDATE_NO_RESPONSE_HOURS ?? '6')

/**
 * 건수 집계 시간 창 (시간 단위)
 * 기본값: 24시간
 */
export const CANDIDATE_WINDOW_HOURS = parseInt(process.env.CANDIDATE_WINDOW_HOURS ?? '24')

/**
 * 대기 등록 최소 고유 출처 수
 * 같은 언론사의 반복 배포를 방지
 * 기본값: 2개
 */
export const CANDIDATE_MIN_UNIQUE_SOURCES = parseInt(process.env.CANDIDATE_MIN_UNIQUE_SOURCES ?? '2')

/**
 * 이슈 등록 최소 화력 임계값
 * 이 값 미만이면 자동 반려 처리
 * 기본값: 15점
 */
export const CANDIDATE_MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')

/**
 * 커뮤니티 글 매칭 최소 공통 키워드 수
 * 뉴스 그루핑과 별도로 더 엄격하게 적용
 * 기본값: 2개
 */
export const CANDIDATE_COMMUNITY_MATCH_THRESHOLD = parseInt(process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2')

/**
 * 자동 승인 허용 카테고리 목록
 * 기본값: ['사회', '기술', '스포츠']
 */
export const CANDIDATE_AUTO_APPROVE_CATEGORIES = process.env.AUTO_APPROVE_CATEGORIES?.split(',') ?? 
    ['사회', '기술', '스포츠']

// 하위 호환을 위한 별칭 export
export const ALERT_THRESHOLD = CANDIDATE_ALERT_THRESHOLD
export const AUTO_APPROVE_THRESHOLD = CANDIDATE_AUTO_APPROVE_THRESHOLD
export const NO_RESPONSE_HOURS = CANDIDATE_NO_RESPONSE_HOURS
export const WINDOW_HOURS = CANDIDATE_WINDOW_HOURS
export const MIN_UNIQUE_SOURCES = CANDIDATE_MIN_UNIQUE_SOURCES
export const MIN_HEAT_TO_REGISTER = CANDIDATE_MIN_HEAT_TO_REGISTER
export const COMMUNITY_MATCH_THRESHOLD = CANDIDATE_COMMUNITY_MATCH_THRESHOLD
export const AUTO_APPROVE_CATEGORIES = CANDIDATE_AUTO_APPROVE_CATEGORIES
