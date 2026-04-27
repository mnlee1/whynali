/**
 * app/api/admin/ai-key-status/route.ts
 *
 * [관리자 - AI 키 상태 수동 해제]
 *
 * Rate Limit으로 차단된 Groq/Claude API 키 상태를 강제로 해제합니다.
 * 정상 해제 시간을 기다릴 수 없을 때 수동으로 차단을 풀기 위해 사용합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') as 'groq' | 'claude' | null

    if (!provider || !['groq', 'claude'].includes(provider)) {
        return NextResponse.json(
            { error: 'INVALID_PROVIDER', message: 'provider는 groq 또는 claude여야 합니다' },
            { status: 400 }
        )
    }

    const now = new Date().toISOString()

    const { error } = await supabaseAdmin
        .from('ai_key_status')
        .update({
            is_blocked: false,
            blocked_until: null,
            fail_count: 0,
            updated_at: now,
        })
        .eq('provider', provider)
        .eq('is_blocked', true)

    if (error) {
        console.error('[ai-key-status] 해제 에러:', error)
        return NextResponse.json(
            { error: 'DB_ERROR', message: 'Rate Limit 해제 실패' },
            { status: 500 }
        )
    }

    console.log(`[ai-key-status] ${provider} Rate Limit 수동 해제 완료`)

    return NextResponse.json({ success: true, provider, clearedAt: now })
}
