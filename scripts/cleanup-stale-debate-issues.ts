/**
 * scripts/cleanup-stale-debate-issues.ts
 *
 * 오래된 논란중(화제집중) 이슈 15건 데이터 정리
 *
 * - 14건: 오매칭 뉴스 해제, 타임라인(발단 제외) 삭제, 커뮤니티 해제, 요약 재생성, 화력 재계산
 * - 트럼프 중동 이슈: 잘못 생성된 이슈 → hidden + 종결
 *
 * dry-run:  npx tsx scripts/cleanup-stale-debate-issues.ts
 * 실행:     DRY_RUN=false npx tsx scripts/cleanup-stale-debate-issues.ts
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const DRY_RUN = process.env.DRY_RUN !== 'false'

const TRUMP_ISSUE_ID = '5bd84f20-6926-4e46-9809-49deb8a5a63e'

const CLEANUP_ISSUE_IDS = [
    '232133ca-4c95-43dd-8a88-ed4061189d31',
    '98095b26-6850-4077-9770-e39d2b176643',
    '153e3186-b2c9-407a-ae8e-ce7162e95beb',
    'd9c7c5c0-c94b-46e4-b84b-6c4f9be424ad',
    '1d3cc0db-9ad5-4c79-b89f-a8adde4b6792',
    'feddd571-ea5d-4ffa-a23b-44e15cc3ef93',
    '04cce786-c985-4887-bf4c-0d02d09ee350',
    '787e37ad-7bca-4add-ae7a-eb99b242dcf2',
    'abbbbf6a-a588-41d3-b665-4e81d6fbe6d0',
    '5349bafb-6331-4d38-9bc8-a664a338791d',
    '7329a3b9-a024-480a-8031-f323f3e98282',
    '5fcd201c-470d-46eb-94b3-fa29669366d3',
    '51267a4e-48e6-4a5d-88f1-d531c6a8df63',
    '1e230aed-0d06-4380-acff-a922822e2c53',
]

const MIN_KEYWORD_OVERLAP = 2
const MIN_NEWS_KW_COVERAGE = 0.45

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과',
    '도', '만', '에서', '한', '하는', '하고', '하여', '해서', '이다', '있다',
    '없다', '하다', '되다', '것', '수', '등', '및', '또', '그', '더',
    '이후', '앞서', '관련', '대해', '위해', '따라', '통해', '대한', '위한',
    '같은', '지난', '현재', '오늘', '해당', '기자', '속보', '종합', '단독',
    '보도', '전문',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .replace(/\[.*?\]/g, '')
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

function countKeywordOverlap(issueTitle: string, itemTitle: string): number {
    const issueKws = extractKeywords(issueTitle)
    const itemKws = extractKeywords(itemTitle)
    let overlap = 0
    for (const kw of issueKws) {
        if (itemKws.has(kw)) overlap++
        else if (kw.length >= 2) {
            for (const nkw of itemKws) {
                if (nkw.length >= 2 && (kw.includes(nkw) || nkw.includes(kw))) {
                    overlap++
                    break
                }
            }
        }
    }
    return overlap
}

function isWrongMatch(issueTitle: string, itemTitle: string): boolean {
    if (!itemTitle) return false
    const itemKws = extractKeywords(itemTitle)
    const overlap = countKeywordOverlap(issueTitle, itemTitle)
    if (overlap === 0) return true
    if (itemKws.size > 0 && overlap / itemKws.size >= MIN_NEWS_KW_COVERAGE) return false
    return overlap < MIN_KEYWORD_OVERLAP
}

type SupabaseAdmin = Awaited<typeof import('../lib/supabase/server')>['supabaseAdmin']

async function hideTrumpIssue(supabaseAdmin: SupabaseAdmin): Promise<void> {
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id, title, status')
        .eq('id', TRUMP_ISSUE_ID)
        .single()

    if (!issue) {
        console.log('  ✗ 트럼프 이슈 없음')
        return
    }

    console.log(`\n[잘못 생성 이슈 숨김] ${issue.title}`)
    if (DRY_RUN) {
        console.log('  → hidden + 종결 예정')
        return
    }

    await supabaseAdmin
        .from('issues')
        .update({
            visibility_status: 'hidden',
            status: '종결',
            heat_index: 0,
            updated_at: new Date().toISOString(),
        })
        .eq('id', TRUMP_ISSUE_ID)

    console.log('  → hidden + 종결 완료')
}

async function cleanupIssue(
    issueId: string,
    supabaseAdmin: SupabaseAdmin,
    generateAndCacheSummaries: typeof import('../lib/ai/generate-timeline-summary')['generateAndCacheSummaries'],
    recalculateHeatForIssue: typeof import('../lib/analysis/heat')['recalculateHeatForIssue'],
    evaluateStatusTransition: typeof import('../lib/analysis/status-transition')['evaluateStatusTransition'],
): Promise<void> {
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id, title, topic_description')
        .eq('id', issueId)
        .single()

    if (!issue) {
        console.log(`  ✗ 이슈 없음: ${issueId}`)
        return
    }

    const [newsRes, tpRes, commRes] = await Promise.all([
        supabaseAdmin.from('news_data').select('id, title').eq('issue_id', issueId),
        supabaseAdmin.from('timeline_points').select('id, title, stage').eq('issue_id', issueId),
        supabaseAdmin.from('community_data').select('id, title').eq('issue_id', issueId),
    ])

    const wrongNews = (newsRes.data ?? []).filter(n => isWrongMatch(issue.title, n.title ?? ''))
    const wrongTp = (tpRes.data ?? []).filter(p => p.stage !== '발단' && isWrongMatch(issue.title, p.title ?? ''))
    const wrongComm = (commRes.data ?? []).filter(c => isWrongMatch(issue.title, c.title ?? ''))

    console.log(`\n[${issue.title}]`)
    console.log(`  뉴스 해제 ${wrongNews.length} / 타임라인 삭제 ${wrongTp.length} / 커뮤 해제 ${wrongComm.length}`)

    if (DRY_RUN) return

    if (wrongTp.length > 0) {
        await supabaseAdmin.from('timeline_points').delete().in('id', wrongTp.map(p => p.id))
    }
    if (wrongNews.length > 0) {
        await supabaseAdmin.from('news_data').update({ issue_id: null }).in('id', wrongNews.map(n => n.id))
    }
    if (wrongComm.length > 0) {
        await supabaseAdmin.from('community_data').update({ issue_id: null }).in('id', wrongComm.map(c => c.id))
    }

    try {
        await generateAndCacheSummaries(issue.id, issue.title, issue.topic_description ?? null)
    } catch (err) {
        console.warn(`  ⚠️ 요약 재생성 실패:`, err)
    }

    const heat = await recalculateHeatForIssue(issue.id)

    const { data: issueRow } = await supabaseAdmin
        .from('issues')
        .select('status, approval_status, approved_at, created_at, heat_index')
        .eq('id', issueId)
        .single()

    if (issueRow?.status === '논란중') {
        const transition = await evaluateStatusTransition({
            id: issueId,
            status: issueRow.status,
            approval_status: issueRow.approval_status,
            approved_at: issueRow.approved_at,
            created_at: issueRow.created_at,
            heat_index: heat,
        })
        if (transition.newStatus) {
            await supabaseAdmin
                .from('issues')
                .update({ status: transition.newStatus, updated_at: new Date().toISOString() })
                .eq('id', issueId)
            console.log(`  → 상태: 논란중 → ${transition.newStatus} (${transition.reason.message})`)
        } else {
            console.log(`  → 화력 ${heat}점, 논란중 유지`)
        }
    } else {
        console.log(`  → 화력 ${heat}점`)
    }
}

async function main() {
    const { supabaseAdmin } = await import('../lib/supabase/server')
    const { generateAndCacheSummaries } = await import('../lib/ai/generate-timeline-summary')
    const { recalculateHeatForIssue } = await import('../lib/analysis/heat')
    const { evaluateStatusTransition } = await import('../lib/analysis/status-transition')

    console.log(`=== 오래된 논란중 이슈 정리 (${DRY_RUN ? 'DRY-RUN' : '실행'}) ===`)

    await hideTrumpIssue(supabaseAdmin)

    for (const id of CLEANUP_ISSUE_IDS) {
        await cleanupIssue(
            id,
            supabaseAdmin,
            generateAndCacheSummaries,
            recalculateHeatForIssue,
            evaluateStatusTransition,
        )
    }

    console.log(`\n=== 완료 (${DRY_RUN ? 'dry-run — DRY_RUN=false 로 실제 실행' : '실제 반영됨'}) ===`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
