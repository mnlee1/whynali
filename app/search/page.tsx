import { Suspense } from 'react'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { formatDate } from '@/lib/utils/format-date'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import SearchHeader from '@/components/search/SearchHeader'

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
            .select('id, body, issue_id, created_at, issues(id, title)')
            .in('approval_status', ['진행중', '마감'])
            .or(buildOrFilter('body', matchedIssueIds))
            .order('created_at', { ascending: false })
            .limit(10),
        admin
            .from('votes')
            .select('id, title, phase, issue_id, created_at, issues(id, title)')
            .eq('approval_status', '승인')
            .or(buildOrFilter('title', matchedIssueIds))
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const discussions = discussionResult.data ?? []
    const votes = voteResult.data ?? []
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
                        {issues.map((issue) => (
                            <Link key={issue.id} href={`/issue/${issue.id}`} className="block">
                                <article className="card-hover p-5">
                                    {/* 상단: 상태 배지 */}
                                    <div className="mb-2.5">
                                        <StatusBadge status={issue.status} size="sm" />
                                    </div>

                                    {/* 제목 */}
                                    <h3 className="text-base font-semibold text-content-primary mb-3 line-clamp-2">
                                        {decodeHtml(issue.title)}
                                    </h3>

                                    {/* 하단: 카테고리 · 날짜 */}
                                    <div className="flex items-center gap-2 text-xs text-content-muted">
                                        <span>{issue.category}</span>
                                        <span>·</span>
                                        <span>{formatDate(issue.created_at)}</span>
                                    </div>
                                </article>
                            </Link>
                        ))}
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
                            return (
                                <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                                    <article className="card-hover p-5">
                                        {/* 토론 주제 본문 */}
                                        <p className="text-base font-semibold text-content-primary mb-3 line-clamp-2 leading-snug">
                                            {decodeHtml(topic.body)}
                                        </p>

                                        {/* 연결된 이슈 · 날짜 */}
                                        <div className="flex items-center gap-2 text-xs text-content-muted">
                                            {issueData && (
                                                <>
                                                    <span>{decodeHtml(issueData.title)}</span>
                                                    <span>·</span>
                                                </>
                                            )}
                                            <span>{formatDate(topic.created_at)}</span>
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
                            return (
                                <Link key={vote.id} href={`/issue/${vote.issue_id}`} className="block">
                                    <article className="card-hover p-5">
                                        {/* 투표 제목 */}
                                        <p className="text-base font-semibold text-content-primary mb-3 line-clamp-2 leading-snug">
                                            {decodeHtml(vote.title)}
                                        </p>

                                        {/* 연결된 이슈 · 상태 · 날짜 */}
                                        <div className="flex items-center gap-2 text-xs text-content-muted">
                                            {issueData && (
                                                <>
                                                    <span>{decodeHtml(issueData.title)}</span>
                                                    <span>·</span>
                                                </>
                                            )}
                                            <span>{vote.phase}</span>
                                            <span>·</span>
                                            <span>{formatDate(vote.created_at)}</span>
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
