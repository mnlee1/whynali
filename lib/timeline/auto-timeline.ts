/**
 * lib/timeline/auto-timeline.ts
 *
 * [타임라인 자동 생성]
 *
 * 이슈에 연결된 뉴스 데이터를 날짜순으로 분석해
 * timeline_points 레코드를 자동으로 생성합니다.
 *
 * 단계 할당 규칙:
 *   - 첫 번째 뉴스 → 발단
 *   - 마지막 뉴스  → 진정 (이슈 상태 '종결' 시) / 전개 (진행중 시)
 *   - 나머지       → 전개 · 파생 번갈아가며
 *
 * 이미 타임라인 포인트가 1개 이상 있는 이슈는 건너뜁니다.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import type { IssueStatus, TimelineStage } from '@/types/issue'

/** 이슈당 최대 생성 포인트 수 (환경변수로 조정 가능) */
const MAX_POINTS = parseInt(process.env.AUTO_TIMELINE_MAX_POINTS ?? '5')

export interface AutoTimelineResult {
    issueId: string
    issueTitle: string
    pointsCreated: number
}

/**
 * assignStages - 뉴스 수에 따라 단계 배열 반환
 *
 * 이슈 상태가 종결이면 마지막 단계를 '진정'으로,
 * 그 외에는 '전개'로 처리합니다.
 */
function assignStages(count: number, issueStatus: IssueStatus): TimelineStage[] {
    if (count === 0) return []

    const lastStage: TimelineStage = issueStatus === '종결' ? '진정' : '전개'
    const middlePool: TimelineStage[] = ['전개', '파생', '전개', '파생', '전개']

    if (count === 1) return ['발단']
    if (count === 2) return ['발단', lastStage]

    const middle = middlePool.slice(0, count - 2)
    return ['발단', ...middle, lastStage]
}

/**
 * sampleNews - 최대 MAX_POINTS개를 균등 간격으로 선택
 *
 * 뉴스가 많을 경우 처음·끝을 포함해 균등하게 샘플링합니다.
 */
function sampleNews<T>(items: T[], max: number): T[] {
    if (items.length <= max) return items

    const result: T[] = []
    const step = (items.length - 1) / (max - 1)

    for (let i = 0; i < max; i++) {
        result.push(items[Math.round(i * step)])
    }

    return result
}

/**
 * generateTimelineForIssue - 단일 이슈 타임라인 자동 생성
 *
 * 이미 포인트가 있으면 0을 반환하고 건너뜁니다.
 */
async function generateTimelineForIssue(
    issueId: string,
    issueTitle: string,
    issueStatus: IssueStatus,
): Promise<number> {
    // 이미 타임라인 포인트가 있으면 skip
    const { count } = await supabaseAdmin
        .from('timeline_points')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    if ((count ?? 0) > 0) return 0

    // 이슈에 연결된 뉴스를 발행일 오름차순으로 조회
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title, link, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: true })

    if (!news || news.length === 0) return 0

    const sampled = sampleNews(news, MAX_POINTS)
    const stages = assignStages(sampled.length, issueStatus)

    const points = sampled.map((item, idx) => ({
        issue_id: issueId,
        occurred_at: item.published_at,
        source_url: item.link,
        stage: stages[idx],
        title: item.title,
    }))

    const { error } = await supabaseAdmin
        .from('timeline_points')
        .insert(points)

    if (error) {
        console.error(`타임라인 자동 생성 에러 (issue: ${issueId}):`, error)
        return 0
    }

    return points.length
}

/**
 * generateTimelines - 승인된 이슈 중 타임라인 없는 이슈에 자동 생성
 *
 * Cron에서 주기적으로 호출합니다.
 * 처리 대상: approval_status='승인' + visibility_status='visible'
 */
export async function generateTimelines(): Promise<AutoTimelineResult[]> {
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, status')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .order('created_at', { ascending: false })
        .limit(50)

    if (!issues || issues.length === 0) return []

    const results: AutoTimelineResult[] = []

    for (const issue of issues) {
        const pointsCreated = await generateTimelineForIssue(
            issue.id,
            issue.title,
            issue.status as IssueStatus,
        )

        if (pointsCreated > 0) {
            results.push({
                issueId: issue.id,
                issueTitle: issue.title,
                pointsCreated,
            })
        }
    }

    return results
}
