/**
 * app/api/admin/discussions/generate/route.ts
 *
 * [관리자 - AI 토론 주제 후보 수동 생성 API]
 *
 * 관리자가 특정 이슈에 대해 AI 토론 주제 후보를 수동으로 생성 요청할 때 사용.
 * 생성된 주제는 approval_status='대기'로만 저장되며, 관리자 승인 후에만 서비스에 노출된다.
 *
 * 요청: POST /api/admin/discussions/generate
 * Body: { issue_id: string, count?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import type { IssueMetadata } from '@/lib/ai/discussion-generator'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, count = 3 } = body

        if (!issue_id) {
            return NextResponse.json(
                { error: 'issue_id가 필요합니다.' },
                { status: 400 }
            )
        }

        if (count < 1 || count > 5) {
            return NextResponse.json(
                { error: 'count는 1~5 사이여야 합니다.' },
                { status: 400 }
            )
        }

        // 이슈 메타데이터 조회 (본문 필드 선택 안 함 — 법적 안전)
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

        // 승인된 이슈만 토론 주제 생성 대상 (기획 02 §6.4 정책 준수)
        if (issue.approval_status !== '승인') {
            return NextResponse.json(
                { error: '승인된 이슈만 토론 주제를 생성할 수 있습니다.' },
                { status: 422 }
            )
        }

        // 관련 뉴스 헤드라인 조회 (최신 5개, 제목만)
        const { data: newsData } = await supabaseAdmin
            .from('news_data')
            .select('title')
            .eq('issue_id', issue_id)
            .order('published_at', { ascending: false })
            .limit(5)

        const newsTitles = (newsData ?? []).map((n) => n.title).filter(Boolean) as string[]

        if (newsTitles.length === 0) {
            return NextResponse.json(
                { error: '이슈에 연결된 뉴스가 없습니다. 뉴스를 먼저 연결해주세요.' },
                { status: 422 }
            )
        }

        const metadata: IssueMetadata = {
            id: issue.id,
            title: issue.title,
            category: issue.category ?? '기타',
            status: issue.status ?? '점화',
            heat_index: issue.heat_index ?? undefined,
            news_titles: newsTitles,
        }

        // AI 토론 주제 후보 생성
        const topics = await generateDiscussionTopics(metadata, count)

        if (topics.length === 0) {
            return NextResponse.json(
                { error: 'AI가 토론 주제를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' },
                { status: 502 }
            )
        }

        // 생성된 주제를 JSON으로 반환 (DB 저장은 프론트엔드에서 선택 후 처리)
        return NextResponse.json({ data: topics, generated: topics.length }, { status: 201 })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'AI 토론 주제 생성 실패'
        console.error('[discussions/generate]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
