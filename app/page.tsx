/**
 * app/page.tsx
 *
 * [홈 페이지 — 메인화면]
 *
 * 왜난리 서비스의 메인 화면입니다.
 * 상단은 2컬럼 레이아웃으로 구성됩니다.
 *   - 왼쪽(2/3): 왜난리 이슈 캐러셀
 *   - 오른쪽(1/3): N월 N주 인기 랭킹
 * 하단에는 투표 미리보기, 전체 이슈 목록, 커뮤니티 토론이 이어집니다.
 *
 * 성능 최적화:
 * - ISR (Incremental Static Regeneration): 15분 캐싱
 * - 서버사이드 병렬 데이터 패칭: 모든 섹션 데이터를 한 번에 SSR로 가져옴
 *   → 클라이언트 waterfall(HTML → JS → fetch → render) 제거
 *   → 홈 진입 시 스켈레톤 없이 즉시 콘텐츠 표시
 * 
 * SEO:
 * - JSON-LD WebSite 스키마 (사이트 검색 기능)
 */

import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import HotIssueHighlight from '@/components/issues/HotIssueHighlight'
import PopularRanking from '@/components/issues/PopularRanking'
import VotePreview from '@/components/votes/VotePreview'
import CommunityPreview from '@/components/community/CommunityPreview'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import type { Vote, VoteChoice, DiscussionTopic } from '@/types/index'
import { generateWebSiteSchema, createJsonLd } from '@/lib/seo/schema'

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
}

async function fetchPageData() {
    const [hotResult, surgingResult, latestResult, votesResult, discussionsResult] = await Promise.all([
        // HotIssueHighlight용 (heat 상위 30개)
        supabaseAdmin
            .from('issues')
            .select('*')
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .order('heat_index', { ascending: false, nullsFirst: false })
            .limit(30),

        // PopularRanking용 급상승 이슈 (heat_index_1h_ago가 있는 이슈만, 종결 제외)
        supabaseAdmin
            .from('issues')
            .select('*')
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .not('heat_index_1h_ago', 'is', null)
            .neq('status', '종결')
            .order('heat_index', { ascending: false, nullsFirst: false })
            .limit(50),

        // IssueList 초기 데이터 (최신순 10개)
        supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .order('created_at', { ascending: false })
            .range(0, 9),

        // VotePreview 데이터
        supabaseAdmin
            .from('votes')
            .select('*, vote_choices(*), issues(id, title, approval_status, visibility_status)')
            .in('phase', ['진행중', '마감'])
            .eq('approval_status', '승인')
            .order('created_at', { ascending: false })
            .limit(50),

        // CommunityPreview 데이터 (진행중 우선, 부족 시 마감으로 보충)
        supabaseAdmin
            .from('discussion_topics')
            .select('*, issues(id, title)')
            .in('approval_status', ['진행중', '마감'])
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    // 토론 주제별 의견(댓글) 수 계산
    const discussionsData = discussionsResult.data ?? []
    const topicIds = discussionsData.map((t) => t.id)
    const opinionCountMap: Record<string, number> = {}

    if (topicIds.length > 0) {
        const { data: commentRows } = await supabaseAdmin
            .from('comments')
            .select('discussion_topic_id')
            .in('discussion_topic_id', topicIds)
            .eq('visibility', 'public')

        for (const row of commentRows ?? []) {
            if (row.discussion_topic_id) {
                opinionCountMap[row.discussion_topic_id] = (opinionCountMap[row.discussion_topic_id] ?? 0) + 1
            }
        }
    }

    // 유효한 이슈와 연결된 투표만 노출
    type RawVote = Vote & {
        vote_choices: VoteChoice[]
        issues: { id: string; title: string; approval_status: string; visibility_status: string } | null
    }
    const votes: VoteWithChoices[] = ((votesResult.data ?? []) as RawVote[])
        .filter(v => {
            if (!v.issue_id) return false  // 이슈 연결 없는 투표 제외 (카드 렌더 불가)
            if (!v.issues) return false
            return v.issues.approval_status === '승인' && v.issues.visibility_status === 'visible'
        })
        .map(v => ({
            ...v,
            issues: v.issues ? { id: v.issues.id, title: v.issues.title } : null,
        }))

    // 슬라이드 이슈 확정 (종결 제외 상위 5개, 부족 시 종결으로 보충)
    const hotIssues = (hotResult.data ?? []) as Issue[]
    const nonClosedHero = hotIssues.filter(i => i.status !== '종결').slice(0, 5)
    const heroIssues = nonClosedHero.length >= 5
        ? nonClosedHero
        : [
            ...nonClosedHero,
            ...hotIssues
                .filter(i => i.status === '종결')
                .slice(0, 5 - nonClosedHero.length),
          ]
    const heroIds = new Set(heroIssues.map(i => i.id))

    // 급상승 이슈 계산: 증가율 기준 정렬 + 슬라이드 이슈 제외
    const surgingCandidates = (surgingResult.data ?? []) as Issue[]
    let surgingIssues = surgingCandidates
        .filter(issue => !heroIds.has(issue.id) && issue.heat_index_1h_ago && issue.heat_index_1h_ago > 0)
        .map(issue => {
            const currentHeat = issue.heat_index ?? 0
            const previousHeat = issue.heat_index_1h_ago ?? 0
            const surgePct = ((currentHeat - previousHeat) / previousHeat) * 100
            return { ...issue, surgePct }
        })
        .sort((a, b) => b.surgePct - a.surgePct)
        .slice(0, 5)

    // 급상승 이슈 5개 미달 시 화력 상위 이슈로 보충 (슬라이드 이슈 제외)
    if (surgingIssues.length < 5) {
        const surgingIds = new Set(surgingIssues.map(i => i.id))
        const fallback = hotIssues
            .filter(i => i.status !== '종결' && !heroIds.has(i.id) && !surgingIds.has(i.id))
            .map(i => ({ ...i, surgePct: 0 }))
            .slice(0, 5 - surgingIssues.length)
        surgingIssues = [...surgingIssues, ...fallback]
    }

    // 토론 주제: 진행중 우선으로 5개 선별, 부족 시 마감으로 보충
    const sortedDiscussions = [
        ...discussionsData.filter((t: any) => t.approval_status === '진행중'),
        ...discussionsData.filter((t: any) => t.approval_status === '마감'),
    ].slice(0, 5)

    const discussionsWithStats = sortedDiscussions.map((topic: any) => ({
        ...topic,
        opinionCount: opinionCountMap[topic.id] ?? 0,
        viewCount: topic.view_count ?? 0,
    }))

    return {
        heroIssues,
        surgingIssues,
        latestIssues: {
            data: (latestResult.data ?? []) as Issue[],
            total: latestResult.count ?? 0,
        },
        votes,
        discussions: discussionsWithStats as TopicWithIssue[],
    }
}

export default async function HomePage() {
    const { heroIssues, surgingIssues, latestIssues, votes, discussions } = await fetchPageData()

    const websiteSchema = generateWebSiteSchema()

    return (
        <>
            <Script
                id="home-website-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(websiteSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8 space-y-10">
            {/* 상단 2컬럼: 히어로 / 인기 랭킹 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 왼쪽: 캐러셀 */}
                <div className="lg:col-span-2">
                    <HotIssueHighlight initialIssues={heroIssues} />
                </div>

                {/* 오른쪽: 급상승 랭킹 */}
                <div className="lg:col-span-1 h-full">
                    <PopularRanking initialIssues={surgingIssues} isSurging />
                </div>
            </div>

            {/* 투표 미리보기 */}
            <VotePreview initialVotes={votes} />

            {/* 전체 이슈 목록 */}
            <section>
                <IssueList initialData={latestIssues} initialLimit={10} hideSearch showFullLabel />
            </section>

            {/* 커뮤니티 최신 토론 */}
            <CommunityPreview initialTopics={discussions} />
        </div>
        </>
    )
}
