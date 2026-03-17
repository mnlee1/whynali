/**
 * app/api/admin/force-recalc-heat/[id]/route.ts
 * 
 * 특정 이슈의 화력을 강제로 재계산
 */

import { NextRequest, NextResponse } from 'next/server'
import { calculateHeatIndex } from '@/lib/analysis/heat'
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
        
        const heat = await calculateHeatIndex(id)

        await writeAdminLog('화력재계산', 'issue', id, auth.adminEmail, `heat_index=${heat}`)

        return NextResponse.json({
            success: true,
            issue_id: id,
            heat_index: heat
        })
        
    } catch (error) {
        console.error('화력 재계산 에러:', error)
        return NextResponse.json(
            { 
                error: 'RECALC_ERROR', 
                message: error instanceof Error ? error.message : '화력 재계산 실패' 
            },
            { status: 500 }
        )
    }
}
