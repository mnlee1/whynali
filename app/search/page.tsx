import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { decodeHtml } from '@/lib/utils/decode-html'

const STATUS_LABEL: Record<string, string> = {
    '점화': '점화',
    '논란중': '논란중',
    '종결': '종결',
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const { q } = await searchParams
    const query = q?.trim() ?? ''

    if (!query || query.length < 2) {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold mb-4">검색</h1>
                <p className="text-sm text-gray-500">검색어를 2자 이상 입력해 주세요.</p>
            </div>
        )
    }

    const admin = createSupabaseAdminClient()

    const [issueResult, discussionResult] = await Promise.all([
        admin
            .from('issues')
            .select('id, title, status, category, created_at')
            .ilike('title', `%${query}%`)
            .eq('approval_status', '승인')
            .order('created_at', { ascending: false })
            .limit(10),
        admin
            .from('discussion_topics')
            .select('id, body, issue_id, created_at, issues(id, title)')
            .ilike('body', `%${query}%`)
            .eq('approval_status', '승인')
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const issues = issueResult.data ?? []
    const discussions = discussionResult.data ?? []
    const totalCount = issues.length + discussions.length

    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl font-bold mb-1">검색 결과</h1>
            <p className="text-sm text-gray-500 mb-6">
                "{query}" — {totalCount > 0 ? `${totalCount}개 결과` : '결과 없음'}
            </p>

            {totalCount === 0 && (
                <p className="text-sm text-gray-400 text-center py-12">
                    검색 결과가 없습니다.
                </p>
            )}

            {/* 이슈 결과 */}
            {issues.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-base font-semibold text-gray-700 mb-3">
                        이슈 ({issues.length})
                    </h2>
                    <ul className="space-y-2">
                        {issues.map((issue) => (
                            <li key={issue.id}>
                                <Link
                                    href={`/issue/${issue.id}`}
                                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">
                                            {decodeHtml(issue.title)}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-gray-400">{issue.category}</span>
                                            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                                                {STATUS_LABEL[issue.status] ?? issue.status}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                                        {new Date(issue.created_at).toLocaleDateString('ko-KR')}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* 토론 주제 결과 */}
            {discussions.length > 0 && (
                <section>
                    <h2 className="text-base font-semibold text-gray-700 mb-3">
                        토론 주제 ({discussions.length})
                    </h2>
                    <ul className="space-y-2">
                        {discussions.map((topic) => {
                            const raw = topic.issues as { id: string; title: string }[] | { id: string; title: string } | null
                            const issueData = Array.isArray(raw) ? raw[0] ?? null : raw
                            return (
                                <li key={topic.id}>
                                    <Link
                                        href={`/community/${topic.id}`}
                                        className="block p-3 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                                    >
                                        <p className="text-sm text-gray-800 line-clamp-2">
                                            {decodeHtml(topic.body)}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {issueData && (
                                                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                                                    {decodeHtml(issueData.title)}
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400">
                                                {new Date(topic.created_at).toLocaleDateString('ko-KR')}
                                            </span>
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}
        </div>
    )
}
