/**
 * app/api/admin/issues/[id]/fix-wrong-news/route.ts
 *
 * [관리자 - 이슈 오매칭 뉴스 정리 API]
 *
 * AI 오매칭으로 잘못 연결된 뉴스·타임라인 포인트를 정리합니다.
 *
 * POST { "dryRun": true }  → 삭제 대상 미리보기 (실제 삭제 없음)
 * POST { "dryRun": false, "keywords": ["조국", "..."] } → 해당 키워드가 포함된 항목 실제 삭제
 * POST { "dryRun": false } → 모든 뉴스·타임라인 포인트 삭제 후 issue_id null 처리
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id: issueId } = await context.params

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false
    const filterKeywords: string[] = body.keywords ?? []

    try {
        // 이슈 확인
        const { data: issue } = await supabaseAdmin
            .from('issues')
            .select('id, title, category')
            .eq('id', issueId)
            .single()

        if (!issue) {
            return NextResponse.json({ error: 'ISSUE_NOT_FOUND', message: '이슈를 찾을 수 없습니다' }, { status: 404 })
        }

        // timeline_points 조회
        const { data: timelinePoints } = await supabaseAdmin
            .from('timeline_points')
            .select('id, title, source_url, stage, occurred_at')
            .eq('issue_id', issueId)
            .order('occurred_at', { ascending: true })

        // news_data 조회
        const { data: newsData } = await supabaseAdmin
            .from('news_data')
            .select('id, title, link, published_at')
            .eq('issue_id', issueId)
            .order('published_at', { ascending: false })

        const allTimelinePoints = timelinePoints ?? []
        const allNewsData = newsData ?? []

        // 삭제 대상 필터링
        const matchesFn = (title: string | null) => {
            if (!title) return false
            if (filterKeywords.length === 0) return true
            const lower = title.toLowerCase()
            return filterKeywords.some(kw => lower.includes(kw.toLowerCase()))
        }

        const timelineToDelete = allTimelinePoints.filter(p => matchesFn(p.title))
        const newsToUnlink = allNewsData.filter(n => matchesFn(n.title))

        if (dryRun) {
            return NextResponse.json({
                dryRun: true,
                issue: { id: issue.id, title: issue.title, category: issue.category },
                summary: {
                    timelinePoints: { total: allTimelinePoints.length, toDelete: timelineToDelete.length },
                    newsData: { total: allNewsData.length, toUnlink: newsToUnlink.length },
                },
                timelineToDelete: timelineToDelete.map(p => ({ id: p.id, title: p.title, stage: p.stage, occurred_at: p.occurred_at })),
                newsToUnlink: newsToUnlink.map(n => ({ id: n.id, title: n.title, published_at: n.published_at })),
                message: '미리보기 완료. dryRun: false로 재요청하면 실제 삭제됩니다.',
            })
        }

        // 실제 삭제 실행
        let deletedTimeline = 0
        let unlinkedNews = 0

        if (timelineToDelete.length > 0) {
            const { error } = await supabaseAdmin
                .from('timeline_points')
                .delete()
                .in('id', timelineToDelete.map(p => p.id))
            if (error) throw new Error(`타임라인 삭제 실패: ${error.message}`)
            deletedTimeline = timelineToDelete.length
        }

        if (newsToUnlink.length > 0) {
            const { error } = await supabaseAdmin
                .from('news_data')
                .update({ issue_id: null })
                .in('id', newsToUnlink.map(n => n.id))
            if (error) throw new Error(`뉴스 연결 해제 실패: ${error.message}`)
            unlinkedNews = newsToUnlink.length
        }

        await writeAdminLog(
            '오매칭 뉴스 정리',
            issueId,
            null,
            auth.adminEmail,
            `타임라인 ${deletedTimeline}건 삭제, 뉴스 ${unlinkedNews}건 연결 해제 (키워드: ${filterKeywords.join(', ') || '전체'})`
        )

        return NextResponse.json({
            dryRun: false,
            issue: { id: issue.id, title: issue.title },
            deletedTimeline,
            unlinkedNews,
            message: `타임라인 ${deletedTimeline}건 삭제, 뉴스 ${unlinkedNews}건 연결 해제 완료`,
        })
    } catch (error) {
        console.error('[fix-wrong-news] 에러:', error)
        return NextResponse.json(
            { error: 'FIX_FAILED', message: error instanceof Error ? error.message : '정리 실패' },
            { status: 500 }
        )
    }
}
