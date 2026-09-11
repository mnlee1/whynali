/**
 * app/page.tsx
 *
 * [홈 페이지 — 메인화면]
 *
 * 왜난리 서비스의 메인 화면입니다.
 * 상단은 급상승 중 이슈 랭킹(매거진형, 전체 폭) 단독 섹션이고,
 * 오늘의 난리 투표는 매체별 토픽 큐레이션과 추천 큐레이션 사이 독립 섹션으로 배치됩니다.
 * 하단에는 전체 이슈 목록, 커뮤니티 토론이 이어집니다.
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

import PopularRanking from '@/components/issues/PopularRanking'
import VotePreview from '@/components/votes/VotePreview'
import TopicCurationSection, { type TopicChannel } from '@/components/home/TopicCurationSection'
import RecommendedCurationSection from '@/components/home/RecommendedCurationSection'
import FadeInSection from '@/components/common/FadeInSection'
import { supabaseAdmin } from '@/lib/supabase-server'
import type { Issue, IssueCategory } from '@/types/issue'
import type { Vote, VoteChoice } from '@/types/index'
import { generateWebSiteSchema, createJsonLd } from '@/lib/seo/schema'

// 매체별 토픽 큐레이션에 노출할 카테고리와 순서 고정 — 2행 x 3열(경제/기술/연예, 정치/사회/스포츠).
// 화력 기반 동적 선정 대신 항상 이 6개(세계 제외)를 이 순서로 보여준다.
const TOPIC_CHANNEL_CATEGORIES: IssueCategory[] = ['경제', '기술', '연예', '정치', '사회', '스포츠']
const RECOMMEND_ITEM_COUNT = 3

// 하단 큐레이션(토픽/추천) 선정용 최신순 가중치 — 화력(heat_index)이 비슷하거나 낮아도
// 최근 생성된 이슈가 더 유리하도록, 생성일 기준 지수 감쇠를 곱해 점수를 매긴다.
// 반감기 12시간: 반나절 지난 이슈는 같은 화력이어도 점수가 절반으로 깎인다.
// (lib/analysis/heat.ts의 화력 계산 자체가 "최근 3일 100% 가중치"라 3일 반감기는 사실상 무의미했음)
const RECENCY_HALF_LIFE_HOURS = 12
// 최신 가중치로 인해 노이즈성 이슈가 카테고리 대표로 뽑히지 않도록 거는 최소 화력 하한선.
// 실 데이터 확인 결과 대부분의 이슈가 heat_index 0(커뮤니티 반응 전)이라 5로 걸면 후보군이
// 거의 남지 않아 토픽/추천 큐레이션이 통째로 비는 문제가 있었음 — 하한선 없이 최신 가중치만 적용.
const MIN_HEAT_FOR_CURATION = 0
function recencyWeight(createdAt: string): number {
    const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
    return Math.pow(0.5, Math.max(ageHours, 0) / RECENCY_HALF_LIFE_HOURS)
}
function weightedScore(issue: Pick<Issue, 'heat_index' | 'created_at'>): number {
    return (issue.heat_index ?? 0) * recencyWeight(issue.created_at)
}

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: {
        id: string
        title: string
        category?: Issue['category']
        topic_description?: Issue['topic_description']
        brief_summary?: Issue['brief_summary']
        heat_index?: number | null
        thumbnail_urls?: string[] | null
        primary_thumbnail_index?: number | null
    } | null
}

async function fetchPageData() {
    const [surgingResult, heatPoolResult, discussionRowsResult, votesResult] = await Promise.all([
        // PopularRanking용: 화력 상위 이슈 (종결 포함 — 진행 중 이슈 부족 시 종결 이슈로 채움)
        supabaseAdmin
            .from('issues')
            .select('*')
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .order('heat_index', { ascending: false, nullsFirst: false })
            .limit(20),

        // 매체별 토픽 큐레이션 + 화제성 급상승 큐레이션의 원본 풀 (화력 상위 300개)
        supabaseAdmin
            .from('issues')
            .select('*')
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
            .order('heat_index', { ascending: false, nullsFirst: false })
            .limit(300),

        // "토론이 뜨거운 이슈" 큐레이션 집계용
        supabaseAdmin
            .from('discussion_topics')
            .select('issue_id')
            .eq('approval_status', '진행중'),

        // VotePreview 데이터
        supabaseAdmin
            .from('votes')
            .select('*, vote_choices(*), issues(id, title, approval_status, visibility_status, category, topic_description, brief_summary, heat_index, thumbnail_urls, primary_thumbnail_index)')
            .in('phase', ['진행중', '마감'])
            .eq('approval_status', '승인')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(50),

    ])

    // 유효한 이슈와 연결된 투표만 노출
    type RawVote = Vote & {
        vote_choices: VoteChoice[]
        issues: {
            id: string
            title: string
            approval_status: string
            visibility_status: string
            category: Issue['category']
            topic_description: Issue['topic_description']
            brief_summary: Issue['brief_summary']
            heat_index: number | null
            thumbnail_urls: string[] | null
            primary_thumbnail_index: number | null
        } | null
    }
    const votes: VoteWithChoices[] = ((votesResult.data ?? []) as RawVote[])
        .filter(v => {
            if (!v.issue_id) return false  // 이슈 연결 없는 투표 제외 (카드 렌더 불가)
            if (!v.issues) return false
            return v.issues.approval_status === '승인' && v.issues.visibility_status === 'visible'
        })
        .map(v => ({
            ...v,
            issues: v.issues ? {
                id: v.issues.id,
                title: v.issues.title,
                category: v.issues.category,
                topic_description: v.issues.topic_description,
                brief_summary: v.issues.brief_summary,
                heat_index: v.issues.heat_index,
                thumbnail_urls: v.issues.thumbnail_urls,
                primary_thumbnail_index: v.issues.primary_thumbnail_index,
            } : null,
        }))

    // 급상승중: 화력 상위 이슈 후보군 (PopularRanking에서 화제집중/점화중 슬롯 구성 후 5개로 압축)
    const surgingIssues = (surgingResult.data ?? []) as Issue[]

    // 섹션 간 중복 노출을 막기 위한 전역 usedIds — 페이지 렌더 순서(랭킹 → 투표 → 토픽 큐레이션 → 추천 큐레이션)대로 누적한다.
    // 랭킹/투표에 이미 쓰인 이슈는 우선 제외하되, 특정 카테고리의 후보가 모자라면(아래 토픽 큐레이션 단계) 완성도를 위해 다시 채운다.
    const usedIds = new Set<string>([
        ...surgingIssues.map(i => i.id),
        ...votes.map(v => v.issues?.id).filter((id): id is string => !!id),
    ])

    // ── 매체별 토픽 큐레이션: 카테고리 6개(세계 제외) 고정 순서로 채널 구성 (히어로 1 + 서브 3) ──
    // 카테고리 자체는 화력과 무관하게 항상 TOPIC_CHANNEL_CATEGORIES 순서대로 보여주고,
    // 카테고리 안에서 어떤 이슈를 히어로/서브로 뽑을지만 화력(가중 점수) 순으로 정한다.
    // 카테고리별로 아직 안 쓰인 이슈를 우선 채우고, 4개(히어로+서브3)가 안 모이면 랭킹/투표에 쓰인 이슈로 폴백해 채널을 완성한다.
    // 최신순 가중치 적용: 화력이 비슷해도 최근 생성된 이슈가 우선되도록 재정렬.
    // 단, 최소 화력(MIN_HEAT_FOR_CURATION) 미만인 노이즈성 이슈는 아무리 최신이어도 제외한다.
    const heatPool = ((heatPoolResult.data ?? []) as Issue[])
        .filter(i => (i.heat_index ?? 0) >= MIN_HEAT_FOR_CURATION)
        .sort((a, b) => weightedScore(b) - weightedScore(a))
    const byCategory = new Map<IssueCategory, Issue[]>()
    for (const issue of heatPool) {
        const list = byCategory.get(issue.category) ?? []
        list.push(issue)
        byCategory.set(issue.category, list)
    }
    const topicChannels: TopicChannel[] = TOPIC_CHANNEL_CATEGORIES
        .map((category) => {
            const issues = byCategory.get(category) ?? []
            if (issues.length === 0) return null
            const preferred = issues.filter(i => !usedIds.has(i.id))
            const picks = preferred.length >= 4
                ? preferred.slice(0, 4)
                : [...preferred, ...issues.filter(i => usedIds.has(i.id))].slice(0, 4)
            if (picks.length === 0) return null
            return { category, hero: picks[0], subs: picks.slice(1, 4) }
        })
        .filter((ch): ch is TopicChannel => ch !== null)
    topicChannels.forEach(ch => {
        usedIds.add(ch.hero.id)
        ch.subs.forEach(s => usedIds.add(s.id))
    })

    // ── 추천 큐레이션 1: 화제성 급상승 (토픽 큐레이션에 이미 쓰인 이슈 제외) ──
    const hotItems = heatPool.filter(i => !usedIds.has(i.id)).slice(0, RECOMMEND_ITEM_COUNT)
    hotItems.forEach(i => usedIds.add(i.id))

    // ── 추천 큐레이션 2: 토론이 뜨거운 이슈 (진행중 토론 개수 기준) ──
    const discussionCounts = new Map<string, number>()
    for (const row of (discussionRowsResult.data ?? []) as { issue_id: string | null }[]) {
        if (!row.issue_id) continue
        discussionCounts.set(row.issue_id, (discussionCounts.get(row.issue_id) ?? 0) + 1)
    }
    // 후보를 넉넉히(20개) 뽑아둔 뒤, 실제 생성일을 확인하고서 "토론 개수 x 최신순 가중치"로 최종 정렬한다.
    // 개수만으로 자르면 최근 이슈가 후보에조차 못 들 수 있어, 가중치가 반영될 여지를 넓혀둔다.
    const discussionCandidateIds = Array.from(discussionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .filter(id => !usedIds.has(id))
        .slice(0, 20)

    let discussionItems: Issue[] = []
    if (discussionCandidateIds.length > 0) {
        const { data: discussionIssues } = await supabaseAdmin
            .from('issues')
            .select('*')
            .in('id', discussionCandidateIds)
            .eq('approval_status', '승인')
            .eq('visibility_status', 'visible')
            .is('merged_into_id', null)
        const byId = new Map(((discussionIssues ?? []) as Issue[]).map(i => [i.id, i]))
        discussionItems = discussionCandidateIds
            .map(id => byId.get(id))
            .filter((i): i is Issue => !!i)
            .sort((a, b) => {
                const scoreA = (discussionCounts.get(a.id) ?? 0) * recencyWeight(a.created_at)
                const scoreB = (discussionCounts.get(b.id) ?? 0) * recencyWeight(b.created_at)
                return scoreB - scoreA
            })
            .slice(0, RECOMMEND_ITEM_COUNT)
    }
    discussionItems.forEach(i => usedIds.add(i.id))

    // ── 추천 큐레이션 3: 지금 막 뜨는 이슈 (1시간 전 대비 heat_index 급상승분 기준) ──
    const risingItems = heatPool
        .filter(i => !usedIds.has(i.id))
        .map(i => ({ issue: i, delta: (i.heat_index ?? 0) - (i.heat_index_1h_ago ?? i.heat_index ?? 0) }))
        .filter(x => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, RECOMMEND_ITEM_COUNT)
        .map(x => x.issue)
    risingItems.forEach(i => usedIds.add(i.id))

    // 추천 큐레이션: 급상승/토론/막 뜨는 이슈를 그룹 구분 없이 하나의 가로 피드로 합침
    // 4컬럼 x 2페이지 = 8개를 채우는 게 목표라, 세 후보군을 합쳐도 모자라면 화력 상위 풀(heatPool)에서 나머지를 채운다.
    const combinedRecommended = [...risingItems, ...hotItems, ...discussionItems]
    const fillCount = 8 - combinedRecommended.length
    const fillItems = fillCount > 0
        ? heatPool.filter(i => !usedIds.has(i.id)).slice(0, fillCount)
        : []
    const recommendedItems: Issue[] = [...combinedRecommended, ...fillItems].slice(0, 8)

    return {
        surgingIssues,
        topicChannels,
        recommendedItems,
        votes,
    }
}

export default async function HomePage() {
    const { surgingIssues, topicChannels, recommendedItems, votes } = await fetchPageData()

    const websiteSchema = generateWebSiteSchema()

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(websiteSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8 space-y-4">
            {/* 상단: 급상승 랭킹 (매거진형, 전체 폭) */}
            <FadeInSection>
                <h2 className="text-[24px] font-bold text-content-primary mb-5">🔥 지금 왜 난리야? TOP5</h2>
                <PopularRanking initialIssues={surgingIssues} isSurging />
            </FadeInSection>

            {/* 매체별 토픽 큐레이션 — 카드별로 자체 스크롤 페이드인 처리하므로 섹션 전체를 감싸지 않음 */}
            <TopicCurationSection channels={topicChannels} />

            {/* 오늘의 난리 투표 — 위치는 임시, 추후 조정 예정 */}
            <FadeInSection>
                <VotePreview initialVotes={votes} />
            </FadeInSection>

            {/* 추천 큐레이션 */}
            <FadeInSection>
                <RecommendedCurationSection items={recommendedItems} />
            </FadeInSection>

        </div>
        </>
    )
}
