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

export interface CleanupResult {
    deletedNews: number
    deletedCommunity: number
    retainDays: number
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
