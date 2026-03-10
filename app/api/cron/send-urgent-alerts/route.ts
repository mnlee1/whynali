/**
 * app/api/cron/send-urgent-alerts/route.ts
 * 
 * [Cron - 긴급 이슈 Dooray 알림]
 * 
 * 1시간마다 실행하여 즉시 처리 필요한 이슈를 Dooray로 알림
 * 조건: 화력 30점 이상 + 연예/정치 카테고리 + 대기 상태
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sendDoorayUrgentAlert } from '@/lib/dooray-notification'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    // Cron Secret 검증
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: 'UNAUTHORIZED', message: '인증 실패' },
            { status: 401 }
        )
    }

    try {
        // 긴급 이슈 조회 (화력 30점 이상 + 연예/정치 + 대기 상태)
        const { data: urgentIssues, error } = await supabaseAdmin
            .from('issues')
            .select('id, title, category, heat_index, created_at')
            .eq('approval_status', '대기')
            .gte('heat_index', 30)
            .in('category', ['연예', '정치'])
            .order('heat_index', { ascending: false })

        if (error) throw error

        console.log(`[긴급 알림] 대기 이슈 ${urgentIssues?.length || 0}건 발견`)

        // 긴급 이슈가 없으면 알림 스킵
        if (!urgentIssues || urgentIssues.length === 0) {
            return NextResponse.json({
                success: true,
                message: '긴급 이슈 없음',
                count: 0,
            })
        }

        // Dooray 알림 전송
        const sent = await sendDoorayUrgentAlert(urgentIssues)

        return NextResponse.json({
            success: true,
            message: sent ? 'Dooray 알림 전송 완료' : 'Dooray 알림 전송 실패',
            count: urgentIssues.length,
            sent,
        })
    } catch (error) {
        console.error('[긴급 알림] 에러:', error)
        return NextResponse.json(
            { 
                error: 'ALERT_ERROR', 
                message: error instanceof Error ? error.message : '알림 전송 실패' 
            },
            { status: 500 }
        )
    }
}
