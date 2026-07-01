import { supabaseAdmin } from '@/lib/supabase-server'

export type AutoOpJobType = 'bot_comment' | 'bot_comment_batch' | 'bot_discussion_comment' | 'bot_discussion_batch'
export type AutoOpStatus = 'success' | 'failed' | 'skipped'

export async function writeAutoOpLog(params: {
    job_type: AutoOpJobType
    status: AutoOpStatus
    target_type?: string
    target_id?: string
    details?: Record<string, unknown>
}): Promise<void> {
    try {
        await supabaseAdmin.from('auto_operation_logs').insert({
            job_type: params.job_type,
            status: params.status,
            target_type: params.target_type ?? null,
            target_id: params.target_id ?? null,
            details: params.details ?? null,
        })
    } catch (e) {
        // 로그 실패가 본 작업에 영향 주면 안 됨
        console.error('[auto-op-log] 기록 실패:', e)
    }
}
