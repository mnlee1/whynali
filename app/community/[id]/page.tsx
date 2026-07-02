import Link from 'next/link'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Eye, MessageCircleMore } from 'lucide-react'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import DiscussionComments from '@/components/issue/DiscussionComments'
import ViewCounter from '@/components/issue/ViewCounter'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatFullDate } from '@/lib/utils/format-date'
import { SITE_NAME, SITE_URL } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

// generateMetadata + DiscussionTopicPage 간 DB 쿼리 공유
const getTopic = cache(async (id: string) => {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
        .from('discussion_topics')
        .select('*, issues(id, title)')
        .eq('id', id)
        .in('approval_status', ['진행중', '마감'])
        .single()
    if (error) return null
    return data
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const topic = await getTopic(id)

    if (!topic) {
        return { title: '토론을 찾을 수 없습니다' }
    }

    const issueData = topic.issues as { id: string; title: string } | null
    const title = decodeHtml(topic.body)
    const description = issueData
        ? `'${decodeHtml(issueData.title)}' 이슈의 토론 주제입니다. 왜난리 커뮤니티에서 다양한 의견을 나눠보세요.`
        : `왜난리 커뮤니티 토론 주제입니다. 다양한 관점에서 의견을 나눠보세요.`

    return {
        title,
        description,
        alternates: {
            canonical: `${SITE_URL}/community/${id}`,
        },
        openGraph: {
            title: `${title} | ${SITE_NAME}`,
            description,
            url: `/community/${id}`,
            siteName: SITE_NAME,
            locale: 'ko_KR',
            type: 'article',
        },
        twitter: {
            card: 'summary',
            title: `${title} | ${SITE_NAME}`,
            description,
        },
    }
}

export default async function DiscussionTopicPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const admin = createSupabaseAdminClient()

    const topic = await getTopic(id)

    if (!topic) {
        notFound()
    }

    // 의견(댓글) 수 조회
    const { count: opinionCount } = await admin
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('discussion_topic_id', id)
        .eq('visibility', 'public')

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const issueData = topic.issues as { id: string; title: string } | null
    const isClosed = topic.approval_status === '마감'
    const viewCount = topic.view_count ?? 0

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
            {/* 조회수 증가 (클라이언트에서 마운트 시 한 번 호출) */}
            <ViewCounter endpoint={`/api/discussions/${id}/view`} />

            {/* 뒤로가기 */}
            <Link href="/community" className="inline-block text-sm text-content-muted hover:text-content-secondary mb-4">
                ← 커뮤니티 목록
            </Link>

            {/* 토론 주제 카드 */}
            <div className="card p-5 mb-4">
                {/* 상태 + AI 라벨 */}
                <div className="flex items-center gap-2 mb-2">
                    <span className={[
                        'text-xs px-2.5 py-0.5 rounded-full border font-medium',
                        isClosed
                            ? 'bg-surface-subtle text-content-muted border-border'
                            : 'bg-green-50 text-green-700 border-green-200',
                    ].join(' ')}>
                        {isClosed ? '마감' : '진행중'}
                    </span>
                    {topic.is_ai_generated && (
                        <span className="text-xs px-2.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-200 font-medium">
                            AI 제안 주제
                        </span>
                    )}
                </div>

                {/* 연결 이슈 — 라벨 바로 아래 */}
                {issueData && (
                    <div className="flex items-center gap-1.5 mt-5 mb-3">
                        <span className="text-xs text-content-muted">연결 이슈:</span>
                        <Link
                            href={`/issue/${issueData.id}`}
                            className="text-xs text-primary underline underline-offset-2 hover:text-primary-dark line-clamp-1"
                        >
                            {decodeHtml(issueData.title)} →
                        </Link>
                    </div>
                )}

                {/* 토론 주제 본문 */}
                <p className="text-base md:text-lg font-semibold text-content-primary leading-relaxed whitespace-pre-wrap mb-3">
                    {decodeHtml(topic.body)}
                </p>

                {/* 날짜 */}
                <p className="text-xs text-content-muted mb-3">
                    {formatFullDate(topic.created_at)}
                </p>

                {/* 통계 */}
                <div className="flex items-center gap-3 text-xs text-content-secondary pt-3 border-t border-border-muted">
                    <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                        {viewCount.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                        <MessageCircleMore className="w-4 h-4" strokeWidth={1.8} />
                        {(opinionCount ?? 0).toLocaleString()}
                    </span>
                </div>
            </div>

            {/* 토론 댓글 영역 */}
            <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">의견 나누기</h2>
                    <p className="text-xs text-content-secondary mt-0.5">
                        단순한 찬반이 아닌, 다양한 관점에서 생각을 공유해보세요.
                    </p>
                </div>

                <div className="p-4">
                    <DiscussionComments
                        discussionTopicId={id}
                        userId={userId}
                        isClosed={isClosed}
                    />
                </div>
            </div>
        </div>
    )
}
