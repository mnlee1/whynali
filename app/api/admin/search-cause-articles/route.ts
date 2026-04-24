/**
 * app/api/admin/search-cause-articles/route.ts
 *
 * 특정 이슈의 원인 기사를 역방향 탐색하여 발단에 연결합니다.
 * 이미 생성된 이슈에 수동으로 재실행할 때 사용합니다.
 *
 * 사용법:
 *   GET /api/admin/search-cause-articles?issueId=<uuid>
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { searchAndLinkCauseArticles } from '@/lib/candidate/cause-article-searcher'

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
        .select('id, title, topic_description, category, created_at, status')
        .eq('id', issueId)
        .single()

    if (error || !issue) {
        return NextResponse.json({ error: '이슈를 찾을 수 없습니다' }, { status: 404 })
    }

    console.log(`[search-cause-articles] "${issue.title}" (${issue.status}) 원인 탐색 시작`)

    await searchAndLinkCauseArticles(
        issue.id,
        issue.title,
        issue.topic_description ?? null,
        issue.created_at,
        issue.category,
    )

    return NextResponse.json({
        success: true,
        issueId: issue.id,
        title: issue.title,
        status: issue.status,
    })
}
