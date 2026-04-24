/**
 * app/api/admin/regenerate-timeline/route.ts
 *
 * 특정 이슈의 타임라인 요약을 강제 재생성합니다.
 * 종결 이슈 포함, 이슈 상태 무관하게 동작합니다.
 *
 * 사용법:
 *   GET /api/admin/regenerate-timeline?issueId=<uuid>
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { generateAndCacheSummaries } from '@/lib/ai/generate-timeline-summary'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const issueId = request.nextUrl.searchParams.get('issueId')
    if (!issueId) {
        return NextResponse.json({ error: 'issueId 쿼리 파라미터가 필요합니다' }, { status: 400 })
    }

    const { data: issue, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, topic_description, status')
        .eq('id', issueId)
        .single()

    if (error || !issue) {
        return NextResponse.json({ error: '이슈를 찾을 수 없습니다' }, { status: 404 })
    }

    console.log(`[regenerate-timeline] "${issue.title}" (${issue.status}) 재생성 시작`)

    await generateAndCacheSummaries(issue.id, issue.title, issue.topic_description)

    return NextResponse.json({
        success: true,
        issueId: issue.id,
        title: issue.title,
        status: issue.status,
    })
}
