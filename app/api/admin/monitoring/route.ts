/**
 * app/api/admin/monitoring/route.ts
 *
 * [시스템 모니터링 API]
 * Supabase 무료 플랜 사용량 (DB·스토리지·MAU) 및 데이터 정리 현황 제공
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        // 0. 현재 연결된 Supabase 인스턴스 정보
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const isProduction = supabaseUrl.includes('mdxshmfmcdcotteevwgi')
        const isDevelopment = supabaseUrl.includes('daiwwuofyqjhknidkois')

        let instanceName = '알 수 없음'
        if (isProduction) instanceName = 'whynali-main (실서버)'
        else if (isDevelopment) instanceName = 'whynali-dev (테스트)'

        // 1. DB 크기 추정 (테이블별 row 수 기반, 평균 1KB/row 가정)
        const tables = [
            'issues', 'news_data', 'community_data', 'timeline_points',
            'comments', 'reactions', 'votes', 'discussion_topics', 'users', 'admin_logs',
        ]

        const tableCounts = await Promise.all(
            tables.map(async (table) => {
                const { count, error } = await supabaseAdmin
                    .from(table)
                    .select('*', { count: 'exact', head: true })
                return { table, count: error ? 0 : count || 0 }
            })
        )

        const totalRows = tableCounts.reduce((sum, t) => sum + t.count, 0)
        const estimatedSizeMB = totalRows / 1024

        // 2. 스토리지 사용량 (storage.objects 스키마 직접 조회)
        let storageUsedBytes = 0
        try {
            const storageRes = await fetch(
                `${supabaseUrl}/rest/v1/objects?select=metadata->>size`,
                {
                    headers: {
                        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
                        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                        'Accept-Profile': 'storage',
                    },
                }
            )
            if (storageRes.ok) {
                const files: Array<{ size: string | null }> = await storageRes.json()
                storageUsedBytes = files.reduce(
                    (sum, f) => sum + (parseInt(f.size || '0', 10) || 0),
                    0
                )
            }
        } catch {
            // 조회 실패 시 0으로 유지
        }

        const storageUsedMB = storageUsedBytes / (1024 * 1024)
        const storageLimitMB = 1024 // 무료 플랜 1GB
        const storageUsagePercent = Math.round((storageUsedMB / storageLimitMB) * 100)

        // 3. 월간 활성 유저 (MAU) — Supabase 무료 플랜 한도 체크용
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const [
            { data: activeUsersMonth },
            { data: activeUsersReactionsMonth },
        ] = await Promise.all([
            supabaseAdmin.from('comments').select('user_id').gte('created_at', monthAgo).neq('user_id', null),
            supabaseAdmin.from('reactions').select('user_id').gte('created_at', monthAgo),
        ])

        const uniqueActiveUsersMonth = new Set([
            ...(activeUsersMonth?.map(u => u.user_id) || []),
            ...(activeUsersReactionsMonth?.map(u => u.user_id) || []),
        ]).size

        // 4. 오래된 미연결 데이터 정리 필요 여부 (3개월 이상)
        const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

        const [
            { count: oldNewsCount },
            { count: oldCommunityCount },
        ] = await Promise.all([
            supabaseAdmin.from('news_data').select('*', { count: 'exact', head: true })
                .lt('created_at', threeMonthsAgo).is('issue_id', null),
            supabaseAdmin.from('community_data').select('*', { count: 'exact', head: true })
                .lt('created_at', threeMonthsAgo).is('issue_id', null),
        ])

        // 5. 경고 생성
        const warnings: Array<{ type: string; severity: 'warning' | 'critical'; message: string }> = []

        if (estimatedSizeMB > 450) {
            warnings.push({ type: 'db_size', severity: 'critical', message: `DB 크기가 ${estimatedSizeMB.toFixed(0)}MB로 추정됩니다. 무료 플랜 한도(500MB)에 근접했습니다.` })
        } else if (estimatedSizeMB > 350) {
            warnings.push({ type: 'db_size', severity: 'warning', message: `DB 크기가 ${estimatedSizeMB.toFixed(0)}MB로 추정됩니다. 정리 작업을 고려하세요.` })
        }

        if (storageUsagePercent > 90) {
            warnings.push({ type: 'storage_size', severity: 'critical', message: `스토리지가 ${storageUsedMB.toFixed(0)}MB로 무료 플랜 한도(1GB)에 근접했습니다.` })
        } else if (storageUsagePercent > 70) {
            warnings.push({ type: 'storage_size', severity: 'warning', message: `스토리지가 ${storageUsedMB.toFixed(0)}MB입니다. 파일 정리를 고려하세요.` })
        }

        if (uniqueActiveUsersMonth > 45000) {
            warnings.push({ type: 'mau_limit', severity: 'critical', message: `MAU가 ${uniqueActiveUsersMonth.toLocaleString()}명입니다. 무료 플랜 한도(50,000명)에 근접했습니다.` })
        } else if (uniqueActiveUsersMonth > 35000) {
            warnings.push({ type: 'mau_limit', severity: 'warning', message: `MAU가 ${uniqueActiveUsersMonth.toLocaleString()}명입니다. Pro 플랜 전환을 고려하세요.` })
        }

        const oldDataTotal = (oldNewsCount || 0) + (oldCommunityCount || 0)
        if (oldDataTotal > 10000) {
            warnings.push({ type: 'old_data', severity: 'warning', message: `3개월 이상 된 미연결 데이터가 ${oldDataTotal.toLocaleString()}건 있습니다. 정리를 권장합니다.` })
        }

        return NextResponse.json({
            instance: { name: instanceName, url: supabaseUrl, isProduction, isDevelopment },
            database: {
                estimatedSizeMB: Math.round(estimatedSizeMB),
                limitMB: 500,
                usagePercent: Math.round((estimatedSizeMB / 500) * 100),
            },
            storage: {
                usedMB: parseFloat(storageUsedMB.toFixed(1)),
                limitMB: storageLimitMB,
                usagePercent: storageUsagePercent,
            },
            users: {
                mau: uniqueActiveUsersMonth,
                mauLimit: 50000,
                mauPercent: Math.round((uniqueActiveUsersMonth / 50000) * 100),
            },
            cleanup: {
                oldNews: oldNewsCount || 0,
                oldCommunity: oldCommunityCount || 0,
                total: oldDataTotal,
            },
            warnings,
        }, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        })
    } catch (error) {
        console.error('[Admin Monitoring API] 에러:', error)
        return NextResponse.json(
            { error: 'MONITORING_ERROR', message: '모니터링 데이터 조회 실패' },
            { status: 500 }
        )
    }
}
