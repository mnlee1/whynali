/**
 * app/api/admin/claude-credits/route.ts
 *
 * [관리자 - Claude 크레딧 충전 이력 관리]
 *
 * GET: 충전 이력 목록 조회 (최신 순 10건)
 * POST: 새 충전 등록 (기존 활성 충전건을 비활성화하고 새 충전건 추가)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { data, error } = await supabaseAdmin
            .from('claude_credit_cycles')
            .select('*')
            .order('charged_at', { ascending: false })
            .limit(10)

        if (error) throw error

        return NextResponse.json({ cycles: data })
    } catch (error) {
        console.error('[Claude Credits] 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '충전 이력 조회 실패' },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await req.json()
        const { charged_at, amount_usd, memo } = body

        if (!charged_at || !amount_usd) {
            return NextResponse.json(
                { error: 'INVALID_PARAMS', message: '충전일과 충전액은 필수입니다' },
                { status: 400 }
            )
        }

        if (Number(amount_usd) <= 0) {
            return NextResponse.json(
                { error: 'INVALID_AMOUNT', message: '충전액은 0보다 커야 합니다' },
                { status: 400 }
            )
        }

        // 기존 활성 충전건 비활성화
        await supabaseAdmin
            .from('claude_credit_cycles')
            .update({ is_active: false })
            .eq('is_active', true)

        // 새 충전건 등록
        const { data, error } = await supabaseAdmin
            .from('claude_credit_cycles')
            .insert({
                charged_at,
                amount_usd: Number(amount_usd),
                memo: memo ?? null,
                is_active: true,
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ cycle: data })
    } catch (error) {
        console.error('[Claude Credits] 등록 에러:', error)
        return NextResponse.json(
            { error: 'INSERT_ERROR', message: '충전 등록 실패' },
            { status: 500 }
        )
    }
}
