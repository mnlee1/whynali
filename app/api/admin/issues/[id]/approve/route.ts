/**
 * app/api/admin/issues/[id]/approve/route.ts
 *
 * [관리자 - 이슈 승인 API]
 *
 * 이슈 승인 후 AI 토론 주제 후보를 백그라운드에서 자동 생성한다.
 * 생성된 주제는 approval_status='대기'로 저장되며, 관리자가 별도로 승인해야 서비스에 노출된다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import type { IssueMetadata } from '@/lib/ai/discussion-generator'

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
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('id, title, category, status, heat_index')
            .single()

        if (error) throw error

        // 이슈 승인 즉시 응답 후, 백그라운드에서 AI 토론 주제 후보 생성
        // - PERPLEXITY_API_KEY 미설정 시 건너뜀 (graceful degradation)
        // - 실패해도 이슈 승인 자체는 완료된 상태 유지
        if (process.env.PERPLEXITY_API_KEY && data) {
            generateDiscussionTopicsInBackground(data).catch((e) => {
                console.error('[approve] AI 토론 주제 자동 생성 실패 (이슈 승인은 정상 완료):', e)
            })
        }

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 승인 에러:', error)
        return NextResponse.json(
            { error: 'APPROVE_ERROR', message: '이슈 승인 실패' },
            { status: 500 }
        )
    }
}

/**
 * generateDiscussionTopicsInBackground - 이슈 승인 후 AI 토론 주제 백그라운드 생성
 *
 * 응답 지연을 막기 위해 fire-and-forget 패턴으로 실행.
 * 생성된 주제는 반드시 '대기' 상태로 저장 — 관리자 승인 전 서비스 미노출.
 */
async function generateDiscussionTopicsInBackground(issue: {
    id: string
    title: string
    category: string | null
    status: string | null
    heat_index: number | null
}) {
    const metadata: IssueMetadata = {
        id: issue.id,
        title: issue.title,
        category: issue.category ?? '기타',
        status: issue.status ?? '점화',
        heat_index: issue.heat_index ?? undefined,
    }

    const topics = await generateDiscussionTopics(metadata, 3)
    if (topics.length === 0) return

    const rows = topics.map((t) => ({
        issue_id: issue.id,
        body: t.content,
        is_ai_generated: true,
        approval_status: '대기',
    }))

    const { error } = await supabaseAdmin
        .from('discussion_topics')
        .insert(rows)

    if (error) throw error
}
