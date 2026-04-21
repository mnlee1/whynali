/**
 * app/api/admin/migrations/fix-wrong-news/route.ts
 *
 * [오매칭 뉴스 일괄 정리 마이그레이션]
 *
 * 모든 이슈를 스캔하여 이슈 제목과 키워드가 거의 겹치지 않는
 * 뉴스·타임라인 포인트를 자동으로 정리합니다.
 *
 * POST { "dryRun": true }   → 삭제 대상 미리보기 (실제 삭제 없음)
 * POST { "dryRun": false }  → 실제 정리 실행
 * POST { "issueId": "..." } → 특정 이슈만 처리
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 이슈 제목과 뉴스 제목 간 최소 키워드 겹침 수
// 0 = 공통 키워드 없음 (명백한 오매칭)
// overlap=1은 관련 있는 경우가 많으므로 1 미만(=0)만 삭제
const MIN_KEYWORD_OVERLAP = 1

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과',
    '도', '만', '에서', '한', '하는', '하고', '하여', '해서', '이다', '있다',
    '없다', '하다', '되다', '것', '수', '등', '및', '또', '그', '더',
    '이후', '앞서', '관련', '대해', '위해', '따라', '통해', '대한', '위한',
    '같은', '지난', '현재', '오늘', '해당', '기자', '속보', '종합', '단독',
    '보도', '전문', '자막뉴스', '연합뉴스', '헤드라인', '시각', '이시각',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .replace(/\[.*?\]/g, '') // [속보], [단독] 등 제거
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

function countKeywordOverlap(issueTitle: string, newsTitle: string): number {
    const issueKws = extractKeywords(issueTitle)
    const newsKws = extractKeywords(newsTitle)
    let overlap = 0
    for (const kw of issueKws) {
        if (newsKws.has(kw)) overlap++
        // 부분 일치도 허용 (3글자 이상)
        else if (kw.length >= 3) {
            for (const nkw of newsKws) {
                if (nkw.length >= 3 && (kw.includes(nkw) || nkw.includes(kw))) {
                    overlap++
                    break
                }
            }
        }
    }
    return overlap
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false
    const targetIssueId: string | null = body.issueId ?? null

    try {
        // 처리 대상 이슈 조회
        let issueQuery = supabaseAdmin
            .from('issues')
            .select('id, title, category')
            .order('created_at', { ascending: false })

        if (targetIssueId) {
            issueQuery = issueQuery.eq('id', targetIssueId)
        } else {
            issueQuery = issueQuery.limit(500)
        }

        const { data: issues, error: issuesError } = await issueQuery
        if (issuesError || !issues) {
            return NextResponse.json({ error: 'ISSUES_FETCH_FAILED', message: issuesError?.message }, { status: 500 })
        }

        const report: Array<{
            issueId: string
            issueTitle: string
            wrongNews: Array<{ id: string; title: string; overlap: number }>
            wrongTimeline: Array<{ id: string; title: string; overlap: number }>
        }> = []

        let totalNewsUnlinked = 0
        let totalTimelineDeleted = 0

        for (const issue of issues) {
            // 이슈에 연결된 뉴스 조회
            const { data: newsData } = await supabaseAdmin
                .from('news_data')
                .select('id, title')
                .eq('issue_id', issue.id)

            // 이슈에 연결된 타임라인 포인트 조회
            const { data: timelinePoints } = await supabaseAdmin
                .from('timeline_points')
                .select('id, title')
                .eq('issue_id', issue.id)

            const allNews = newsData ?? []
            const allTimeline = timelinePoints ?? []

            if (allNews.length === 0 && allTimeline.length === 0) continue

            // 오매칭 뉴스 판별
            const wrongNews = allNews.filter(n => {
                if (!n.title) return false
                const overlap = countKeywordOverlap(issue.title, n.title)
                return overlap < MIN_KEYWORD_OVERLAP
            }).map(n => ({
                id: n.id,
                title: n.title ?? '',
                overlap: countKeywordOverlap(issue.title, n.title ?? ''),
            }))

            // 오매칭 타임라인 판별
            const wrongTimeline = allTimeline.filter(p => {
                if (!p.title) return false
                const overlap = countKeywordOverlap(issue.title, p.title)
                return overlap < MIN_KEYWORD_OVERLAP
            }).map(p => ({
                id: p.id,
                title: p.title ?? '',
                overlap: countKeywordOverlap(issue.title, p.title ?? ''),
            }))

            if (wrongNews.length === 0 && wrongTimeline.length === 0) continue

            report.push({
                issueId: issue.id,
                issueTitle: issue.title,
                wrongNews,
                wrongTimeline,
            })

            if (!dryRun) {
                if (wrongTimeline.length > 0) {
                    await supabaseAdmin
                        .from('timeline_points')
                        .delete()
                        .in('id', wrongTimeline.map(p => p.id))
                    totalTimelineDeleted += wrongTimeline.length
                }

                if (wrongNews.length > 0) {
                    await supabaseAdmin
                        .from('news_data')
                        .update({ issue_id: null })
                        .in('id', wrongNews.map(n => n.id))
                    totalNewsUnlinked += wrongNews.length
                }
            } else {
                totalTimelineDeleted += wrongTimeline.length
                totalNewsUnlinked += wrongNews.length
            }
        }

        if (!dryRun && (totalNewsUnlinked > 0 || totalTimelineDeleted > 0)) {
            await writeAdminLog(
                '오매칭 뉴스 일괄 정리',
                targetIssueId ?? 'all',
                null,
                auth.adminEmail,
                `이슈 ${report.length}개 / 타임라인 ${totalTimelineDeleted}건 삭제 / 뉴스 ${totalNewsUnlinked}건 연결 해제`
            )
        }

        return NextResponse.json({
            dryRun,
            processedIssues: issues.length,
            affectedIssues: report.length,
            totalTimelineDeleted,
            totalNewsUnlinked,
            report: dryRun ? report : report.map(r => ({
                issueId: r.issueId,
                issueTitle: r.issueTitle,
                wrongNewsCount: r.wrongNews.length,
                wrongTimelineCount: r.wrongTimeline.length,
            })),
            message: dryRun
                ? `미리보기 완료. dryRun: false 로 재요청하면 실제 정리됩니다.`
                : `정리 완료 — 타임라인 ${totalTimelineDeleted}건 삭제, 뉴스 ${totalNewsUnlinked}건 연결 해제`,
        })

    } catch (error) {
        console.error('[fix-wrong-news migration] 에러:', error)
        return NextResponse.json(
            { error: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}
