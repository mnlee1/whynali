/**
 * app/api/admin/stats-24h/route.ts
 * 
 * [관리자 - 24시간 통계 API]
 * 
 * 최근 24시간 동안의 수집, 이슈 생성, 연결 상태를 요약합니다.
 * 각 단계별 성공/실패 카운트와 문제 발생 시 경고를 표시합니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const now = new Date()
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayIso = yesterday.toISOString()

        // 1. 수집 현황
        const [
            { count: newsCollected },
            { count: communityCollected }
        ] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterdayIso),
            supabaseAdmin
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterdayIso)
        ])

        // 2. 이슈 생성 현황
        const [
            { count: issuesPending },
            { count: issuesApproved },
            { count: issuesRejected },
            { count: issuesMerged }
        ] = await Promise.all([
            supabaseAdmin
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', '대기')
                .gte('created_at', yesterdayIso),
            supabaseAdmin
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', '승인')
                .gte('created_at', yesterdayIso),
            supabaseAdmin
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', '반려')
                .gte('created_at', yesterdayIso),
            supabaseAdmin
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', '병합됨')
                .gte('created_at', yesterdayIso)
        ])

        const totalIssuesCreated = (issuesPending || 0) + (issuesApproved || 0) + (issuesRejected || 0) + (issuesMerged || 0)

        // 3. 연결 상태
        const [
            { count: newsLinked24h },
            { count: communityLinked24h }
        ] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterdayIso)
                .not('issue_id', 'is', null),
            supabaseAdmin
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterdayIso)
                .not('issue_id', 'is', null)
        ])

        const newsUnlinked = (newsCollected || 0) - (newsLinked24h || 0)
        const communityUnlinked = (communityCollected || 0) - (communityLinked24h || 0)

        // 4. 경고 감지
        const warnings = []

        // 수집 경고 (24시간 동안 수집이 너무 적음)
        if ((newsCollected || 0) < 10) {
            warnings.push({
                type: 'collection',
                severity: 'critical',
                message: '뉴스 수집이 24시간 동안 10건 미만입니다',
                value: newsCollected || 0
            })
        }

        if ((communityCollected || 0) < 50) {
            warnings.push({
                type: 'collection',
                severity: 'warning',
                message: '커뮤니티 수집이 24시간 동안 50건 미만입니다',
                value: communityCollected || 0
            })
        }

        // 이슈 생성 경고
        if (totalIssuesCreated === 0 && (newsCollected || 0) > 100) {
            warnings.push({
                type: 'issue_creation',
                severity: 'critical',
                message: '수집 데이터는 많지만 이슈가 생성되지 않았습니다',
                value: 0
            })
        }

        // 승인 대기 경고 (10건 이상 쌓임)
        if ((issuesPending || 0) > 10) {
            warnings.push({
                type: 'approval',
                severity: 'warning',
                message: '승인 대기 이슈가 10건 이상 쌓여 있습니다',
                value: issuesPending || 0
            })
        }

        // 5. 수집 데이터 상세 (출처별)
        const { data: newsDetailData } = await supabaseAdmin
            .from('news_data')
            .select('source, issue_id')
            .gte('created_at', yesterdayIso)

        const newsBySource: Record<string, { total: number; linked: number }> = {}
        newsDetailData?.forEach((item) => {
            if (!newsBySource[item.source]) {
                newsBySource[item.source] = { total: 0, linked: 0 }
            }
            newsBySource[item.source].total++
            if (item.issue_id) {
                newsBySource[item.source].linked++
            }
        })

        const { data: communityDetailData } = await supabaseAdmin
            .from('community_data')
            .select('source_site, issue_id')
            .gte('created_at', yesterdayIso)

        const communityBySite: Record<string, { total: number; linked: number }> = {}
        communityDetailData?.forEach((item) => {
            if (!communityBySite[item.source_site]) {
                communityBySite[item.source_site] = { total: 0, linked: 0 }
            }
            communityBySite[item.source_site].total++
            if (item.issue_id) {
                communityBySite[item.source_site].linked++
            }
        })

        return NextResponse.json({
            collection: {
                news: {
                    total: newsCollected || 0,
                    bySource: newsBySource
                },
                community: {
                    total: communityCollected || 0,
                    bySite: communityBySite
                }
            },
            issues: {
                created: totalIssuesCreated,
                pending: issuesPending || 0,
                approved: issuesApproved || 0,
                rejected: issuesRejected || 0,
                merged: issuesMerged || 0
            },
            linking: {
                news: {
                    linked: newsLinked24h || 0,
                    unlinked: newsUnlinked,
                    rate: newsCollected ? Math.round(((newsLinked24h || 0) / newsCollected) * 100) : 0
                },
                community: {
                    linked: communityLinked24h || 0,
                    unlinked: communityUnlinked,
                    rate: communityCollected ? Math.round(((communityLinked24h || 0) / communityCollected) * 100) : 0
                }
            },
            warnings,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('24시간 통계 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '24시간 통계 조회 실패' },
            { status: 500 }
        )
    }
}
