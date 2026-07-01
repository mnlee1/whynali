/**
 * app/api/admin/shortform/[id]/reset-instagram/route.ts
 *
 * POST /api/admin/shortform/:id/reset-instagram
 *
 * Instagram 업로드 상태를 초기화하여 재업로드 가능하게 함
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
    const { id: jobId } = await params

    const { data: job, error: jobError } = await supabaseAdmin
        .from('shortform_jobs')
        .select('id, issue_title, upload_status')
        .eq('id', jobId)
        .single()

    if (jobError || !job) {
        return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 })
    }

    const currentUploadStatus = job.upload_status as any
    const { instagram: _removed, ...rest } = currentUploadStatus ?? {}

    const { error: updateError } = await supabaseAdmin
        .from('shortform_jobs')
        .update({ upload_status: rest })
        .eq('id', jobId)

    if (updateError) {
        return NextResponse.json({ error: 'UPDATE_FAILED', message: updateError.message }, { status: 500 })
    }

    await writeAdminLog(
        'shortform_instagram_reset',
        'shortform_job',
        jobId,
        auth.adminEmail,
        JSON.stringify({ issueTitle: job.issue_title })
    )

    return NextResponse.json({ success: true })
}
