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
 */

import IssueList from '@/components/issues/IssueList'
import HotIssueHighlight from '@/components/issues/HotIssueHighlight'
import PopularRanking from '@/components/issues/PopularRanking'
import VotePreview from '@/components/votes/VotePreview'
import CommunityPreview from '@/components/community/CommunityPreview'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import type { Vote, VoteChoice, DiscussionTopic } from '@/types/index'

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
}

async function fetchPageData() {
    const [hotResult, latestResult, votesResult, discussionsResult] = await Promise.all([
        // HotIssueHighlight + PopularRanking 공용 (heat 상위 30개)
        supabaseAdmin
            .from('issues')
            .select('*')
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .gte('heat_index', MIN_HEAT)
            .order('heat_index', { ascending: false, nullsFirst: false })
            .limit(30),

        // IssueList 초기 데이터 (최신순 10개)
        supabaseAdmin
            .from('issues')
            .select('*', { count: 'exact' })
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .gte('heat_index', MIN_HEAT)
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

        // CommunityPreview 데이터
        supabaseAdmin
            .from('discussion_topics')
            .select('*, issues(id, title)')
            .eq('approval_status', '진행중')
            .order('created_at', { ascending: false })
            .limit(5),
    ])

    // 유효한 이슈와 연결된 투표만 노출 (votes API와 동일한 필터)
    type RawVote = Vote & {
        vote_choices: VoteChoice[]
        issues: { id: string; title: string; approval_status: string; visibility_status: string } | null
    }
    const votes: VoteWithChoices[] = ((votesResult.data ?? []) as RawVote[])
        .filter(v => {
            if (!v.issue_id) return true
            if (!v.issues) return false
            return v.issues.approval_status === '승인' && v.issues.visibility_status === 'visible'
        })
        .map(v => ({
            ...v,
            issues: v.issues ? { id: v.issues.id, title: v.issues.title } : null,
        }))

    return {
        hotIssues: (hotResult.data ?? []) as Issue[],
        latestIssues: {
            data: (latestResult.data ?? []) as Issue[],
            total: latestResult.count ?? 0,
        },
        votes,
        discussions: (discussionsResult.data ?? []) as TopicWithIssue[],
    }
}

export default async function HomePage() {
    const { hotIssues, latestIssues, votes, discussions } = await fetchPageData()

    // HotIssueHighlight: 종결 제외 상위 5개
    const heroIssues = hotIssues.filter(i => i.status !== '종결').slice(0, 5)

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 space-y-10">
            {/* 상단 2컬럼: 히어로 / 인기 랭킹 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 왼쪽: 캐러셀 */}
                <div className="lg:col-span-2">
                    <HotIssueHighlight initialIssues={heroIssues} />
                </div>

                {/* 오른쪽: 인기 랭킹 */}
                <div className="lg:col-span-1 h-full">
                    <PopularRanking initialIssues={hotIssues} />
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
    )
}
