import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { postBotComment, postBotDiscussionComment } from '@/lib/bot/bot-commenter'

export const dynamic = 'force-dynamic'

const RETRYABLE_JOB_TYPES = ['bot_comment', 'bot_discussion_comment'] as const

/* POST /api/admin/auto-op-logs/retry  body: { log_id: string } */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { log_id } = await request.json().catch(() => ({}))
    if (!log_id) return NextResponse.json({ error: 'log_id 파라미터 필요' }, { status: 400 })

    const { data: log, error } = await supabaseAdmin
        .from('auto_operation_logs')
        .select('job_type, status, target_type, target_id')
        .eq('id', log_id)
        .single()

    if (error || !log) return NextResponse.json({ error: '로그를 찾을 수 없습니다.' }, { status: 404 })
    if (log.status !== 'failed') return NextResponse.json({ error: '실패한 작업만 재시도할 수 있습니다.' }, { status: 400 })
    if (!log.target_id || !RETRYABLE_JOB_TYPES.includes(log.job_type as (typeof RETRYABLE_JOB_TYPES)[number])) {
        return NextResponse.json({ error: '재시도할 수 없는 작업 종류입니다.' }, { status: 400 })
    }

    const posted =
        log.job_type === 'bot_comment'
            ? await postBotComment(log.target_id, { force: true })
            : await postBotDiscussionComment(log.target_id, { force: true })

    return NextResponse.json({ ok: true, posted })
}
