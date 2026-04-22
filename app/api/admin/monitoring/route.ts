/**
 * app/api/admin/monitoring/route.ts
 * 
 * [시스템 모니터링 API]
 * Supabase 사용량, DB 크기, 테이블별 통계, 유저 및 트래픽 지표 제공
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
    try {
        // 0. 현재 연결된 Supabase 인스턴스 정보
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const isProduction = supabaseUrl.includes('mdxshmfmcdcotteevwgi')
        const isDevelopment = supabaseUrl.includes('daiwwuofyqjhknidkois')
        
        let instanceName = '알 수 없음'
        if (isProduction) {
            instanceName = 'whynali-main (실서버)'
        } else if (isDevelopment) {
            instanceName = 'whynali-dev (테스트)'
        }

        // 1. 테이블별 row 수 조회
        const tables = [
            'issues',
            'news_data',
            'community_data',
            'timeline_points',
            'comments',
            'reactions',
            'votes',
            'discussion_topics',
            'users',
            'admin_logs',
        ]

        const tableCounts = await Promise.all(
            tables.map(async (table) => {
                const { count, error } = await supabaseAdmin
                    .from(table)
                    .select('*', { count: 'exact', head: true })
                
                return {
                    table,
                    count: error ? 0 : count || 0,
                }
            })
        )

        // 2. 최근 24시간 생성된 데이터 (트래픽 지표)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const [
            { count: issuesCreated24h },
            { count: commentsCreated24h },
            { count: reactionsCreated24h },
            { count: newsCreated24h },
            { count: usersCreated24h },
            { count: usersCreatedWeek },
            { count: usersCreatedMonth },
        ] = await Promise.all([
            supabaseAdmin
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday),
            supabaseAdmin
                .from('comments')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday),
            supabaseAdmin
                .from('reactions')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday),
            supabaseAdmin
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday),
            supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday),
            supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', weekAgo),
            supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', monthAgo),
        ])

        // 3. 유저 활동 지표
        const { count: totalUsers } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })

        // 최근 활동한 유저 (24시간 내 댓글/반응 작성)
        const { data: activeUsers24h } = await supabaseAdmin
            .from('comments')
            .select('user_id')
            .gte('created_at', yesterday)
            .neq('user_id', null)
        
        const { data: activeUsersReactions24h } = await supabaseAdmin
            .from('reactions')
            .select('user_id')
            .gte('created_at', yesterday)

        const uniqueActiveUsers24h = new Set([
            ...(activeUsers24h?.map(u => u.user_id) || []),
            ...(activeUsersReactions24h?.map(u => u.user_id) || []),
        ]).size

        // 주간 활성 유저 (WAU)
        const { data: activeUsersWeek } = await supabaseAdmin
            .from('comments')
            .select('user_id')
            .gte('created_at', weekAgo)
            .neq('user_id', null)
        
        const { data: activeUsersReactionsWeek } = await supabaseAdmin
            .from('reactions')
            .select('user_id')
            .gte('created_at', weekAgo)

        const uniqueActiveUsersWeek = new Set([
            ...(activeUsersWeek?.map(u => u.user_id) || []),
            ...(activeUsersReactionsWeek?.map(u => u.user_id) || []),
        ]).size

        // 월간 활성 유저 (MAU) - Supabase 무료 플랜 제한 50,000명
        const { data: activeUsersMonth } = await supabaseAdmin
            .from('comments')
            .select('user_id')
            .gte('created_at', monthAgo)
            .neq('user_id', null)
        
        const { data: activeUsersReactionsMonth } = await supabaseAdmin
            .from('reactions')
            .select('user_id')
            .gte('created_at', monthAgo)

        const uniqueActiveUsersMonth = new Set([
            ...(activeUsersMonth?.map(u => u.user_id) || []),
            ...(activeUsersReactionsMonth?.map(u => u.user_id) || []),
        ]).size

        // 4. 인기 이슈 Top 5
        const { data: topIssues } = await supabaseAdmin
            .from('issues')
            .select('id, title, view_count, heat_index, category, status')
            .eq('approval_status', '승인')
            .order('view_count', { ascending: false })
            .limit(5)

        // 5. 카테고리별 이슈 분포
        const { data: categoryDistribution } = await supabaseAdmin
            .from('issues')
            .select('category')
            .eq('approval_status', '승인')

        const categoryCounts = categoryDistribution?.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        // 6. 참여율 계산
        const totalIssues = tableCounts.find(t => t.table === 'issues')?.count || 0
        const totalComments = tableCounts.find(t => t.table === 'comments')?.count || 0
        const totalReactions = tableCounts.find(t => t.table === 'reactions')?.count || 0
        
        const engagementRate = totalIssues > 0 
            ? ((totalComments + totalReactions) / totalIssues).toFixed(2)
            : '0.00'

        // 7. 오래된 데이터 정리 필요 여부 체크 (3개월 이상)
        const threeMonthsAgo = new Date(
            Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString()

        const [
            { count: oldNewsCount },
            { count: oldCommunityCount },
        ] = await Promise.all([
            supabaseAdmin
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .lt('created_at', threeMonthsAgo)
                .is('issue_id', null),
            supabaseAdmin
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .lt('created_at', threeMonthsAgo)
                .is('issue_id', null),
        ])

        // 8. DB 크기 추정 (테이블 row 수 기반)
        // 실제 정확한 크기는 Supabase Dashboard에서 확인 필요
        const totalRows = tableCounts.reduce((sum, t) => sum + t.count, 0)
        // 평균 row 크기를 1KB로 가정 (매우 보수적 추정)
        const estimatedSizeMB = (totalRows * 1) / 1024

        // 9. 경고 생성
        const warnings: Array<{
            type: string
            severity: 'warning' | 'critical'
            message: string
        }> = []

        // DB 크기 경고 (500MB 제한)
        if (estimatedSizeMB > 450) {
            warnings.push({
                type: 'db_size',
                severity: 'critical',
                message: `DB 크기가 ${estimatedSizeMB.toFixed(0)}MB로 추정됩니다. 무료 플랜 한도(500MB)에 근접했습니다.`,
            })
        } else if (estimatedSizeMB > 350) {
            warnings.push({
                type: 'db_size',
                severity: 'warning',
                message: `DB 크기가 ${estimatedSizeMB.toFixed(0)}MB로 추정됩니다. 정리 작업을 고려하세요.`,
            })
        }

        // MAU 경고 (Supabase 무료 플랜 제한 50,000명)
        if (uniqueActiveUsersMonth > 45000) {
            warnings.push({
                type: 'mau_limit',
                severity: 'critical',
                message: `월간 활성 유저(MAU)가 ${uniqueActiveUsersMonth.toLocaleString()}명입니다. 무료 플랜 한도(50,000명)에 근접했습니다.`,
            })
        } else if (uniqueActiveUsersMonth > 35000) {
            warnings.push({
                type: 'mau_limit',
                severity: 'warning',
                message: `월간 활성 유저(MAU)가 ${uniqueActiveUsersMonth.toLocaleString()}명입니다. Pro 플랜 전환을 고려하세요.`,
            })
        }

        // 정리 필요 데이터 경고
        const oldDataTotal = (oldNewsCount || 0) + (oldCommunityCount || 0)
        if (oldDataTotal > 10000) {
            warnings.push({
                type: 'old_data',
                severity: 'warning',
                message: `3개월 이상 된 미연결 데이터가 ${oldDataTotal.toLocaleString()}건 있습니다. 정리를 권장합니다.`,
            })
        }

        return NextResponse.json({
            instance: {
                name: instanceName,
                url: supabaseUrl,
                isProduction,
                isDevelopment,
            },
            tables: tableCounts,
            activity24h: {
                issues: issuesCreated24h || 0,
                comments: commentsCreated24h || 0,
                reactions: reactionsCreated24h || 0,
                news: newsCreated24h || 0,
            },
            users: {
                total: totalUsers || 0,
                newToday: usersCreated24h || 0,
                newThisWeek: usersCreatedWeek || 0,
                newThisMonth: usersCreatedMonth || 0,
                dau: uniqueActiveUsers24h,
                wau: uniqueActiveUsersWeek,
                mau: uniqueActiveUsersMonth,
                mauLimit: 50000,
                mauPercent: Math.round((uniqueActiveUsersMonth / 50000) * 100),
            },
            traffic: {
                topIssues: topIssues || [],
                categoryDistribution: categoryCounts || {},
                engagementRate: parseFloat(engagementRate),
            },
            cleanup: {
                oldNews: oldNewsCount || 0,
                oldCommunity: oldCommunityCount || 0,
                total: oldDataTotal,
            },
            database: {
                estimatedSizeMB: Math.round(estimatedSizeMB),
                totalRows,
                limitMB: 500,
                usagePercent: Math.round((estimatedSizeMB / 500) * 100),
            },
            warnings,
        })
    } catch (error) {
        console.error('[Admin Monitoring API] 에러:', error)
        return NextResponse.json(
            { error: 'MONITORING_ERROR', message: '모니터링 데이터 조회 실패' },
            { status: 500 }
        )
    }
}
