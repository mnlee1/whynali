/**
 * app/api/admin/issues/[id]/generate-discussions/route.ts
 *
 * [관리자 - 토론 주제 수동 재생성 API]
 *
 * AI 토론 주제 자동 생성이 실패했거나 추가 주제가 필요한 경우
 * 관리자가 수동으로 토론 주제를 재생성할 수 있습니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import type { IssueMetadata } from '@/lib/ai/discussion-generator'
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

        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('id, title, category, status, heat_index')
            .eq('id', id)
            .single()

        if (issueError) throw issueError
        if (!issue) {
            return NextResponse.json(
                { error: 'ISSUE_NOT_FOUND', message: '이슈를 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        const { count: pendingCount } = await supabaseAdmin
            .from('discussion_topics')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', id)
            .eq('approval_status', '대기')

        if (pendingCount && pendingCount >= 1) {
            return NextResponse.json({
                generated: 0,
                skipped: true,
                message: `이미 대기 중인 토론 주제가 ${pendingCount}건 있습니다`,
                pendingCount,
            })
        }

        if (!process.env.PERPLEXITY_API_KEY) {
            return NextResponse.json(
                {
                    error: 'API_KEY_MISSING',
                    message: 'PERPLEXITY_API_KEY가 설정되지 않았습니다',
                },
                { status: 500 }
            )
        }

        const metadata: IssueMetadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '기타',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
        }

        const topics = await generateDiscussionTopics(metadata, 3)

        if (topics.length === 0) {
            return NextResponse.json({
                generated: 0,
                skipped: false,
                message: 'AI가 토론 주제를 생성하지 못했습니다',
            })
        }

        const rows = topics.map((t) => ({
            issue_id: issue.id,
            body: t.content,
            is_ai_generated: true,
            approval_status: '대기',
        }))

        const { error: insertError } = await supabaseAdmin
            .from('discussion_topics')
            .insert(rows)

        if (insertError) throw insertError

        await writeAdminLog('토론주제생성', 'issue', id, auth.adminEmail, `${topics.length}개 생성 (수동)`)

        return NextResponse.json({
            generated: topics.length,
            skipped: false,
            message: `${topics.length}개의 토론 주제가 생성되었습니다`,
        })
    } catch (error) {
        console.error('토론 주제 생성 에러:', error)
        return NextResponse.json(
            {
                error: 'GENERATION_ERROR',
                message: '토론 주제 생성 실패',
                detail: String(error),
            },
            { status: 500 }
        )
    }
}
