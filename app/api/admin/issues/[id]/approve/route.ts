/**
 * app/api/admin/issues/[id]/approve/route.ts
 *
 * [관리자 - 이슈 승인 API]
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '승인',
                approval_type: 'manual',
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('id, title, category, status, heat_index')
            .single()

        if (error) throw error

        await writeAdminLog('이슈 승인', 'issue', id, auth.adminEmail, `"${data.title}"`)

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 승인 에러:', error)
        return NextResponse.json(
            { error: 'APPROVE_ERROR', message: '이슈 승인 실패' },
            { status: 500 }
        )
    }
}

