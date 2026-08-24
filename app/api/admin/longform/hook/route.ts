/**
 * app/api/admin/longform/hook/route.ts
 *
 * [관리자 - 롱폼 오프닝 훅 문장 A 하이라이트 추출 API]
 *
 * 관리자가 직접 입력한 훅 문장 A에서 강조 단어만 뽑는다 (문장 자체는 생성하지 않음).
 * 실제 추출 로직은 lib/longform/generate-hook-sentence.ts 참고.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { extractHookHighlight } from '@/lib/longform/generate-hook-sentence'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: { text?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const result = await extractHookHighlight(body.text ?? '')

    if (!result.ok) {
        const status = result.error === 'INVALID_INPUT' ? 400 : 500
        return NextResponse.json({ error: result.error, message: result.message }, { status })
    }

    return NextResponse.json({
        highlightsA: result.highlightsA,
        budgetExceeded: result.budgetExceeded,
    })
}
