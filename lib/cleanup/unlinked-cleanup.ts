/**
 * lib/cleanup/unlinked-cleanup.ts
 *
 * [미연결 수집 데이터 정리]
 *
 * 일정 기간이 지났는데도 이슈에 연결되지 않은 news_data, community_data를
 * 주기적으로 삭제해 DB 용량을 관리한다.
 *
 * 삭제 기준:
 *   - issue_id IS NULL (이슈에 연결되지 않은 것)
 *   - created_at < now() - RETAIN_DAYS (보존 기간 초과)
 *
 * RETAIN_DAYS 기본값: 7일
 * 환경변수 CLEANUP_RETAIN_DAYS 로 조정 가능
 */

import { supabaseAdmin } from '@/lib/supabase/server'

const RETAIN_DAYS = parseInt(process.env.CLEANUP_RETAIN_DAYS ?? '7')
const STALE_PENDING_HOURS = parseInt(process.env.STALE_PENDING_HOURS ?? '168')
const STALE_PENDING_MAX_HEAT = parseInt(process.env.STALE_PENDING_MAX_HEAT ?? '15')
const STALE_PENDING_TOPIC_HOURS = parseInt(process.env.STALE_PENDING_TOPIC_HOURS ?? '168')
const STALE_PENDING_VOTE_HOURS = parseInt(process.env.STALE_PENDING_VOTE_HOURS ?? '168')

export interface CleanupResult {
    deletedNews: number
    deletedCommunity: number
    retainDays: number
    deletedStalePending?: number
}

/**
 * cleanupUnlinkedData - 미연결 수집 데이터 삭제
 *
 * 예시:
 * const result = await cleanupUnlinkedData()
 * // result.deletedNews: 삭제된 뉴스 건수
 * // result.deletedCommunity: 삭제된 커뮤니티 건수
 */
export async function cleanupUnlinkedData(): Promise<CleanupResult> {
    const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [newsResult, communityResult] = await Promise.all([
        supabaseAdmin
            .from('news_data')
            .delete()
            .is('issue_id', null)
            .lt('created_at', cutoff)
            .select('id'),
        supabaseAdmin
            .from('community_data')
            .delete()
            .is('issue_id', null)
            .lt('created_at', cutoff)
            .select('id'),
    ])

    if (newsResult.error) {
        console.error('news_data 정리 에러:', newsResult.error)
    }

    if (communityResult.error) {
        console.error('community_data 정리 에러:', communityResult.error)
    }

    return {
        deletedNews: newsResult.data?.length ?? 0,
        deletedCommunity: communityResult.data?.length ?? 0,
        retainDays: RETAIN_DAYS,
    }
}

/**
 * cleanupStalePendingIssues - 오래된 대기 이슈 삭제
 *
 * 생성 후 STALE_PENDING_HOURS 시간이 지났는데도 대기 상태이고
 * 화력이 STALE_PENDING_MAX_HEAT 미만인 이슈를 DB에서 삭제한다.
 *
 * - news_data, community_data의 issue_id는 ON DELETE SET NULL로 자동 처리
 * - 댓글·반응·투표 등은 ON DELETE CASCADE로 자동 삭제
 *
 * 환경변수:
 * - STALE_PENDING_HOURS: 경과 시간 임계값 (기본 48시간)
 * - STALE_PENDING_MAX_HEAT: 화력 상한 (기본 15점)
 */
export async function cleanupStalePendingIssues(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
        .from('issues')
        .delete()
        .eq('approval_status', '대기')
        .lt('created_at', cutoff)
        .lt('heat_index', STALE_PENDING_MAX_HEAT)
        .select('id, title')

    if (error) {
        console.error('대기 이슈 정리 에러:', error)
        return 0
    }

    if (data && data.length > 0) {
        console.log(`[대기 이슈 정리] ${data.length}개 삭제:`)
        data.forEach(issue => console.log(`  - "${issue.title}" (${issue.id})`))
    }

    return data?.length ?? 0
}

export async function cleanupStalePendingDiscussions(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PENDING_TOPIC_HOURS * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
        .from('discussion_topics')
        .delete()
        .eq('approval_status', '대기')
        .lt('created_at', cutoff)
        .select('id, body')

    if (error) {
        console.error('대기 토론 정리 에러:', error)
        return 0
    }

    if (data && data.length > 0) {
        console.log(`[대기 토론 정리] ${data.length}개 삭제`)
    }

    return data?.length ?? 0
}

export async function cleanupStalePendingVotes(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PENDING_VOTE_HOURS * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
        .from('votes')
        .delete()
        .eq('approval_status', '대기')
        .lt('created_at', cutoff)
        .select('id, title')

    if (error) {
        console.error('대기 투표 정리 에러:', error)
        return 0
    }

    if (data && data.length > 0) {
        console.log(`[대기 투표 정리] ${data.length}개 삭제`)
    }

    return data?.length ?? 0
}
