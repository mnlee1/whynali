import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { generateBannedWords } from '@/lib/ai/banned-word-generator'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* GET /api/cron/generate-banned-words — pending_review 댓글 분석 → AI 금칙어 추출 */
export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const result = await generateBannedWords(supabaseAdmin)

        return NextResponse.json({
            success: true,
            inserted: result.inserted,
            skipped: result.skipped,
            words: result.words,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[cron] generate-banned-words 오류:', error)
        return NextResponse.json(
            { error: 'CRON_ERROR', message: error instanceof Error ? error.message : '금칙어 생성 실패' },
            { status: 500 }
        )
    }
}
