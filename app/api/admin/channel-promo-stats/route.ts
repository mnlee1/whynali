/**
 * app/api/admin/channel-promo-stats/route.ts
 *
 * 인스타/유튜브/틱톡 홍보 채널 조회수·구독자수 수동 입력 API.
 * 자동 수집 인프라가 없어 관리자가 직접 입력한 값을 기간별로 기록으로 남긴다.
 *
 * GET  /api/admin/channel-promo-stats?periodType=weekly&periodStart=2026-08-09
 * POST /api/admin/channel-promo-stats
 *   Body: { periodType, periodStart, periodEnd, platform, views, newSubscribers, totalSubscribers, totalViews, likes, comments, shares }
 *
 * totalViews: 유튜브 채널 통계(구독자·전체 누적 조회수) 조회 시 받은 누적 스냅샷. 지금은 화면에서
 * 참고용으로만 저장하고, "이번 기간 발생 조회수"는 애널리틱스 API로 바로 조회해서 쓴다.
 * likes/comments/shares: 유튜브(애널리틱스)·인스타(인사이트) 둘 다 기간을 직접 지정해서 조회하므로 바로 저장.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const periodType = searchParams.get('periodType')
        const periodStart = searchParams.get('periodStart')

        if (!periodType || !periodStart) {
            return NextResponse.json({ error: 'periodType, periodStart는 필수입니다' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('channel_promo_stats')
            .select('*')
            .eq('period_type', periodType)
            .eq('period_start', periodStart)

        if (error) throw error

        return NextResponse.json({ success: true, data: data ?? [] })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류'
        console.error('[channel-promo-stats GET]', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { periodType, periodStart, periodEnd, platform, views, newSubscribers, totalSubscribers, totalViews, likes, comments, shares } = body

        if (!periodType || !periodStart || !periodEnd || !platform) {
            return NextResponse.json({ error: 'periodType, periodStart, periodEnd, platform은 필수입니다' }, { status: 400 })
        }
        if (!['weekly', 'monthly'].includes(periodType)) {
            return NextResponse.json({ error: 'periodType은 weekly 또는 monthly여야 합니다' }, { status: 400 })
        }
        if (!['instagram', 'youtube', 'tiktok'].includes(platform)) {
            return NextResponse.json({ error: 'platform은 instagram, youtube, tiktok 중 하나여야 합니다' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('channel_promo_stats')
            .upsert({
                period_type: periodType,
                period_start: periodStart,
                period_end: periodEnd,
                platform,
                views: views === '' || views === null || views === undefined ? null : Number(views),
                new_subscribers: newSubscribers === '' || newSubscribers === null || newSubscribers === undefined ? null : Number(newSubscribers),
                total_subscribers: totalSubscribers === '' || totalSubscribers === null || totalSubscribers === undefined ? null : Number(totalSubscribers),
                total_views: totalViews === '' || totalViews === null || totalViews === undefined ? null : Number(totalViews),
                likes: likes === '' || likes === null || likes === undefined ? null : Number(likes),
                comments: comments === '' || comments === null || comments === undefined ? null : Number(comments),
                shares: shares === '' || shares === null || shares === undefined ? null : Number(shares),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'period_type,period_start,platform' })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ success: true, data })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류'
        console.error('[channel-promo-stats POST]', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
