/**
 * lib/analysis/status-transition.test.example.ts
 * 
 * [evaluateTransition 단위 테스트 예시]
 * 
 * 리팩토링 후 순수 함수로 분리되어 DB 모킹 없이 단위 테스트가 가능합니다.
 */

import { evaluateTransition, type IssueForTransition, type TransitionData } from './status-transition'

describe('evaluateTransition', () => {
    describe('점화 상태', () => {
        const baseIssue: IssueForTransition = {
            id: 'test-1',
            status: '점화',
            approval_status: '승인',
            approved_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), // 7시간 전
            created_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
            heat_index: 35,
        }

        it('화력 충분 + 커뮤니티 있음 → 논란중 전환', () => {
            const data: TransitionData = {
                communityCount: 5,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBe('논란중')
            expect(result.reason.code).toBe('HEAT_AND_COMMUNITY')
            expect(result.reason.detail.heat).toBe(35)
            expect(result.reason.detail.communityCount).toBe(5)
        })

        it('화력 충분하지만 커뮤니티 부족 → 전환 없음', () => {
            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBeNull()
            expect(result.reason.code).toBe('COMMUNITY_LACKING')
            expect(result.reason.detail.communityCount).toBe(0)
        })

        it('화력 부족 → 종결 (바이패스)', () => {
            const lowHeatIssue: IssueForTransition = {
                ...baseIssue,
                heat_index: 5,
            }

            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(lowHeatIssue, data)

            expect(result.newStatus).toBe('종결')
            expect(result.reason.code).toBe('HEAT_TOO_LOW')
            expect(result.reason.detail.heat).toBe(5)
        })

        it('타임아웃 (24시간 경과, 화력 미달) → 종결', () => {
            const timeoutIssue: IssueForTransition = {
                ...baseIssue,
                approved_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25시간 전
                heat_index: 20,
            }

            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(timeoutIssue, data)

            expect(result.newStatus).toBe('종결')
            expect(result.reason.code).toBe('IGNITE_TIMEOUT')
            expect(result.reason.detail.elapsed).toBeGreaterThan(24)
        })
    })

    describe('논란중 상태', () => {
        const baseIssue: IssueForTransition = {
            id: 'test-2',
            status: '논란중',
            approval_status: '승인',
            approved_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
            created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
            heat_index: 25,
        }

        it('화력 소진 → 종결', () => {
            const lowHeatIssue: IssueForTransition = {
                ...baseIssue,
                heat_index: 5,
            }

            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(lowHeatIssue, data)

            expect(result.newStatus).toBe('종결')
            expect(result.reason.code).toBe('HEAT_TOO_LOW')
        })

        it('신규 수집 건 없음 → 종결', () => {
            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBe('종결')
            expect(result.reason.code).toBe('NO_RECENT_DATA')
        })

        it('신규 수집 있음 → 논란 유지', () => {
            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 5,
                recentCommunityCount: 3,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBeNull()
            expect(result.reason.code).toBe('WAITING')
            expect(result.reason.detail.recentCount).toBe(8)
        })
    })

    describe('종결 상태', () => {
        const baseIssue: IssueForTransition = {
            id: 'test-3',
            status: '종결',
            approval_status: '승인',
            approved_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
            created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
            heat_index: 35,
        }

        it('급증 감지 → 재점화 (논란중)', () => {
            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 0,
                recentCommunityCount: 0,
                rapidNewsCount: 40,
                rapidCommunityCount: 20,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBe('논란중')
            expect(result.reason.code).toBe('REIGNITE_BURST')
            expect(result.reason.detail.rapidCount).toBe(60)
            expect(result.reason.detail.ratePerMinute).toBeGreaterThanOrEqual(5)
        })

        it('점진적 재점화 (신규 수집 + 화력) → 논란중', () => {
            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 10,
                recentCommunityCount: 5,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(baseIssue, data)

            expect(result.newStatus).toBe('논란중')
            expect(result.reason.code).toBe('REIGNITE_GRADUAL')
            expect(result.reason.detail.recentCount).toBe(15)
            expect(result.reason.detail.heat).toBe(35)
        })

        it('재점화 조건 미달 → 종결 유지', () => {
            const lowHeatIssue: IssueForTransition = {
                ...baseIssue,
                heat_index: 15,
            }

            const data: TransitionData = {
                communityCount: 0,
                recentNewsCount: 2,
                recentCommunityCount: 1,
                rapidNewsCount: 0,
                rapidCommunityCount: 0,
            }

            const result = evaluateTransition(lowHeatIssue, data)

            expect(result.newStatus).toBeNull()
            expect(result.reason.code).toBe('WAITING')
        })
    })
})
