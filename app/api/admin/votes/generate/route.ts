/**
 * app/api/admin/votes/generate/route.ts
 *
 * [관리자 - AI 투표 후보 수동 생성 API]
 *
 * 관리자가 특정 이슈에 대해 AI 투표 후보를 수동으로 생성 요청.
 * 생성된 투표는 phase='대기'로 저장되며, 관리자 승인 후에만 활성화된다.
 *
 * 요청: POST /api/admin/votes/generate
 * Body: { issue_id: string, count?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import type { IssueMetadata } from '@/lib/ai/vote-generator'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, count = 2 } = body

        if (!issue_id) {
            return NextResponse.json(
                { error: 'issue_id가 필요합니다.' },
                { status: 400 }
            )
        }

        if (count < 1 || count > 3) {
            return NextResponse.json(
                { error: 'count는 1~3 사이여야 합니다.' },
                { status: 400 }
            )
        }

        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('id, title, category, status, heat_index, approval_status')
            .eq('id', issue_id)
            .single()

        if (issueError || !issue) {
            return NextResponse.json(
                { error: '이슈를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        if (issue.approval_status !== '승인') {
            return NextResponse.json(
                { error: '승인된 이슈만 투표를 생성할 수 있습니다.' },
                { status: 422 }
            )
        }

        const metadata: IssueMetadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '기타',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
        }

        const votes = await generateVoteOptions(metadata, count)

        if (votes.length === 0) {
            return NextResponse.json(
                { error: 'AI가 투표를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' },
                { status: 502 }
            )
        }

        // 생성된 투표를 JSON으로 반환 (DB 저장은 프론트엔드에서 선택 후 처리)
        await writeAdminLog('AI 투표 생성 (미리보기)', 'vote', issue.id, auth.adminEmail)
        return NextResponse.json(
            { data: votes, generated: votes.length },
            { status: 201 }
        )
    } catch (e) {
        const message = e instanceof Error ? e.message : 'AI 투표 생성 실패'
        console.error('[votes/generate]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
