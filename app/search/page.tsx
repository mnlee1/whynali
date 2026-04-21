import { Suspense } from 'react'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import SearchHeader from '@/components/search/SearchHeader'
import { ChevronRight, Eye, MessageSquare, BadgeCheck, Users, MessageCircleMore } from 'lucide-react'

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

async function SearchResults({ query }: { query: string }) {
    if (!query || query.length < 2) {
        return (
            <p className="text-sm text-content-secondary">검색어를 2자 이상 입력해 주세요.</p>
        )
    }

    const admin = createSupabaseAdminClient()

    const keywords = query.split(/\s+/).filter((k) => k.length >= 2)

    if (keywords.length === 0) {
        return (
            <p className="text-sm text-content-secondary">검색어를 2자 이상 입력해 주세요.</p>
        )
    }

    // 1단계: 이슈 키워드 검색
    let issueQuery = admin
        .from('issues')
        .select('id, title, status, category, created_at')
        .eq('approval_status', '승인')

    if (keywords.length === 1) {
        issueQuery = issueQuery.ilike('title', `%${keywords[0]}%`)
    } else {
        issueQuery = issueQuery.or(keywords.map((k) => `title.ilike.%${k}%`).join(','))
    }

    const issueResult = await issueQuery.order('created_at', { ascending: false }).limit(10)
    const issues = issueResult.data ?? []
    const matchedIssueIds = issues.map((i) => i.id)

    // 2단계: 토론/투표 — 키워드 직접 매칭 OR 매칭된 이슈에 속한 것
    const buildOrFilter = (keywordField: string, ids: string[]) => {
        const keywordConds = keywords.map((k) => `${keywordField}.ilike.%${k}%`).join(',')
        if (ids.length === 0) return keywordConds
        const issueConds = `issue_id.in.(${ids.join(',')})`
        return `${keywordConds},${issueConds}`
    }

    const [discussionResult, voteResult] = await Promise.all([
        admin
            .from('discussion_topics')
            .select('id, body, issue_id, created_at, approval_status, view_count, issues(id, title)')
            .in('approval_status', ['진행중', '마감'])
            .or(buildOrFilter('body', matchedIssueIds))
            .order('created_at', { ascending: false })
            .limit(10),
        admin
            .from('votes')
            .select('id, title, phase, issue_id, created_at, issues(id, title), vote_choices(count)')
            .eq('approval_status', '승인')
            .or(buildOrFilter('title', matchedIssueIds))
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const discussions = discussionResult.data ?? []
    const votes = voteResult.data ?? []
    
    // 토론별 댓글 수 계산
    const discussionIds = discussions.map(d => d.id)
    let discussionCommentCounts: Record<string, number> = {}
    if (discussionIds.length > 0) {
        const { data: commentData } = await admin
            .from('comments')
            .select('discussion_topic_id')
            .in('discussion_topic_id', discussionIds)
            .eq('visibility', 'public')
        
        for (const row of commentData ?? []) {
            if (row.discussion_topic_id) {
                discussionCommentCounts[row.discussion_topic_id] = 
                    (discussionCommentCounts[row.discussion_topic_id] ?? 0) + 1
            }
        }
    }

    // 이슈별 통계 계산
    const issueIds = issues.map(i => i.id)
    let issueStats: Record<string, { viewCount: number; commentCount: number; voteCount: number; discussionCount: number }> = {}
    
    if (issueIds.length > 0) {
        const [viewData, commentData, voteData, discussionData] = await Promise.all([
            admin.from('issue_views').select('issue_id').in('issue_id', issueIds),
            admin.from('comments').select('issue_id').in('issue_id', issueIds).eq('visibility', 'public'),
            admin.from('votes').select('issue_id').in('issue_id', issueIds).eq('approval_status', '승인'),
            admin.from('discussion_topics').select('issue_id').in('issue_id', issueIds).in('approval_status', ['진행중', '마감']),
        ])

        for (const id of issueIds) {
            issueStats[id] = {
                viewCount: (viewData.data ?? []).filter(v => v.issue_id === id).length,
                commentCount: (commentData.data ?? []).filter(c => c.issue_id === id).length,
                voteCount: (voteData.data ?? []).filter(v => v.issue_id === id).length,
                discussionCount: (discussionData.data ?? []).filter(d => d.issue_id === id).length,
            }
        }
    }

    const totalCount = issues.length + discussions.length + votes.length

    if (totalCount === 0) {
        return (
            <p className="text-sm text-content-muted text-center py-12">
                "{query}"에 대한 검색 결과가 없습니다.
            </p>
        )
    }

    return (
        <>
            <p className="text-sm text-content-secondary mb-6">
                "{query}" — {totalCount}개 결과
            </p>

            {/* 이슈 결과 */}
            {issues.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-base font-semibold text-content-secondary mb-3">
                        이슈 ({issues.length})
                    </h2>
                    <div className="space-y-4">
                        {issues.map((issue) => {
                            const stats = issueStats[issue.id] ?? { viewCount: 0, commentCount: 0, voteCount: 0, discussionCount: 0 }
                            return (
                                <Link key={issue.id} href={`/issue/${issue.id}`} className="block">
                                    <article className="card-hover p-5">
                                        {/* 상단: 상태 배지 */}
                                        <div className="mb-2.5">
                                            <StatusBadge status={issue.status} size="sm" />
                                        </div>

                                        {/* 제목 */}
                                        <div className="flex items-center gap-0.5 mb-3">
                                            <h3 className="text-base font-semibold text-content-primary line-clamp-2">
                                                {decodeHtml(issue.title)}
                                            </h3>
                                            <ChevronRight className="w-4 h-4 text-content-primary shrink-0" strokeWidth={2.5} />
                                        </div>

                                        {/* 통계 정보 */}
                                        <div className="flex items-center gap-4 text-xs text-content-secondary pt-3 border-t border-border-muted">
                                            {/* 조회수 */}
                                            <span className="flex items-center gap-1">
                                                <Eye className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{stats.viewCount.toLocaleString()}</span>
                                            </span>
                                            {/* 댓글 */}
                                            <span className="flex items-center gap-1">
                                                <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{stats.commentCount.toLocaleString()}</span>
                                            </span>
                                            {/* 투표 */}
                                            <span className="flex items-center gap-1">
                                                <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{stats.voteCount.toLocaleString()}</span>
                                            </span>
                                            {/* 토론 */}
                                            <span className="flex items-center gap-1">
                                                <Users className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{stats.discussionCount.toLocaleString()}</span>
                                            </span>
                                        </div>
                                    </article>
                                </Link>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* 토론 주제 결과 */}
            {discussions.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-base font-semibold text-content-secondary mb-3">
                        토론 주제 ({discussions.length})
                    </h2>
                    <div className="space-y-4">
                        {discussions.map((topic) => {
                            const raw = topic.issues as { id: string; title: string }[] | { id: string; title: string } | null
                            const issueData = Array.isArray(raw) ? raw[0] ?? null : raw
                            const opinionCount = discussionCommentCounts[topic.id] ?? 0
                            const viewCount = topic.view_count ?? 0
                            return (
                                <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                                    <article className="card-hover p-5">
                                        <div className="mb-2.5">
                                            {topic.approval_status === '진행중' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 text-xs font-medium">
                                                    토론 진행중
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-surface-muted text-content-muted border-border text-xs font-medium">
                                                    토론 마감
                                                </span>
                                            )}
                                        </div>

                                        {/* 토론 주제 본문 */}
                                        <p className="text-base font-medium text-content-primary mb-2 line-clamp-2 leading-snug">
                                            {decodeHtml(topic.body)}
                                        </p>

                                        {/* 연결된 이슈 */}
                                        {issueData && (
                                            <p className="text-xs text-content-muted mb-3 line-clamp-1">
                                                연결 이슈 · {decodeHtml(issueData.title)}
                                            </p>
                                        )}

                                        {/* 통계 정보 */}
                                        <div className="flex items-center gap-3 text-xs text-content-secondary pt-3 border-t border-border-muted">
                                            <span className="flex items-center gap-1">
                                                <Eye className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{viewCount.toLocaleString()}</span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MessageCircleMore className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{opinionCount.toLocaleString()}</span>
                                            </span>
                                        </div>
                                    </article>
                                </Link>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* 투표 주제 결과 */}
            {votes.length > 0 && (
                <section>
                    <h2 className="text-base font-semibold text-content-secondary mb-3">
                        투표 ({votes.length})
                    </h2>
                    <div className="space-y-4">
                        {votes.map((vote) => {
                            const raw = vote.issues as { id: string; title: string }[] | { id: string; title: string } | null
                            const issueData = Array.isArray(raw) ? raw[0] ?? null : raw
                            const choices = vote.vote_choices ?? []
                            const totalCount = Array.isArray(choices) ? choices.reduce((sum: number, c: any) => sum + (c.count ?? 0), 0) : 0
                            return (
                                <Link key={vote.id} href={`/issue/${vote.issue_id}`} className="block">
                                    <article className="card-hover p-5">
                                        <div className="mb-2.5">
                                            {vote.phase === '진행중' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                    투표 진행중
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-muted text-xs font-semibold text-content-muted">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-content-muted" />
                                                    투표 마감
                                                </span>
                                            )}
                                        </div>

                                        {/* 투표 제목 */}
                                        <p className="text-base font-semibold text-content-primary mb-2 line-clamp-2 leading-snug">
                                            {decodeHtml(vote.title)}
                                        </p>

                                        {/* 연결된 이슈 */}
                                        {issueData && (
                                            <p className="text-xs text-content-muted mb-3 line-clamp-1">
                                                연결 이슈 · {decodeHtml(issueData.title)}
                                            </p>
                                        )}

                                        {/* 참여 수 */}
                                        <div className="flex items-center justify-between pt-3 border-t border-border-muted">
                                            <span className="text-xs text-content-muted font-medium">
                                                {totalCount.toLocaleString()}명 참여
                                            </span>
                                            <span className="text-xs font-semibold text-primary">
                                                {vote.phase === '진행중' ? '참여하기' : '결과 보기'}
                                            </span>
                                        </div>
                                    </article>
                                </Link>
                            )
                        })}
                    </div>
                </section>
            )}
        </>
    )
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const { q } = await searchParams
    const query = q?.trim() ?? ''

    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <Suspense fallback={
                <div>
                    <h1 className="text-2xl font-bold text-content-primary mb-4">검색</h1>
                    <div className="h-10 bg-surface-subtle rounded-xl animate-pulse mb-6" />
                </div>
            }>
                <SearchHeader initialQuery={query} />
            </Suspense>
            
            <Suspense fallback={
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-surface-subtle rounded-xl animate-pulse" />
                    ))}
                </div>
            }>
                <SearchResults query={query} />
            </Suspense>
        </div>
    )
}
