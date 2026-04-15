/**
 * app/community/[id]/page.tsx
 *
 * 토론 주제 상세 페이지.
 * - 이슈 댓글과 시각적으로 구분된 토론 영역
 * - 철학적 관점 유도 안내 문구와 질문 스타터 칩 제공
 * - 세이프티봇 연동 댓글 작성
 */

import Link from 'next/link'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import DiscussionComments from '@/components/issue/DiscussionComments'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatFullDate } from '@/lib/utils/format-date'

export const dynamic = 'force-dynamic'

export default async function DiscussionTopicPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const admin = createSupabaseAdminClient()

    const { data: topic, error } = await admin
        .from('discussion_topics')
        .select('*, issues(id, title)')
        .eq('id', id)
        .in('approval_status', ['진행중', '마감'])
        .single()

    if (error || !topic) {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                    토론 주제를 찾을 수 없습니다.
                </div>
                <Link href="/community" className="inline-block mt-4 text-sm text-content-secondary hover:text-content-primary underline underline-offset-2">
                    커뮤니티 목록으로 돌아가기
                </Link>
            </div>
        )
    }

    // 조회수 서버사이드 증가 (force-dynamic이므로 매 방문마다 실행됨)
    await admin
        .from('discussion_topics')
        .update({ view_count: (topic.view_count ?? 0) + 1 })
        .eq('id', id)

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const issueData = topic.issues as { id: string; title: string } | null
    const isClosed = topic.approval_status === '마감'

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
            {/* 뒤로가기 */}
            <Link href="/community" className="inline-block text-sm text-content-muted hover:text-content-secondary mb-4">
                ← 커뮤니티 목록
            </Link>

            {/* 토론 주제 카드 */}
            <div className="card p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
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

                {/* 토론 주제 본문 */}
                <p className="text-base md:text-lg font-semibold text-content-primary leading-relaxed whitespace-pre-wrap mb-3">
                    {decodeHtml(topic.body)}
                </p>

                <p className="text-xs text-content-muted">
                    {formatFullDate(topic.created_at)}
                </p>
            </div>

            {/* 연결된 이슈 */}
            {issueData && (
                <div className="mb-6 flex items-center gap-2 px-1">
                    <span className="text-xs text-content-muted">연결 이슈:</span>
                    <Link
                        href={`/issue/${issueData.id}`}
                        className="text-sm text-primary underline underline-offset-2 hover:text-primary-dark"
                    >
                        {issueData.title} →
                    </Link>
                </div>
            )}

            {/* 토론 댓글 영역 */}
            <div className="card overflow-hidden">
                {/* 토론 영역 헤더 */}
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
