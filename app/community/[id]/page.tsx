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

export default async function DiscussionTopicPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const admin = createSupabaseAdminClient()

    const { data: topic, error } = await admin
        .from('discussion_topics')
        .select('*, issues(id, title)')
        .eq('id', id)
        .in('approval_status', ['승인', '종료'])
        .single()

    if (error || !topic) {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    토론 주제를 찾을 수 없습니다.
                </div>
                <Link href="/community" className="inline-block mt-4 text-sm text-blue-600 underline">
                    커뮤니티 목록으로 돌아가기
                </Link>
            </div>
        )
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const issueData = topic.issues as { id: string; title: string } | null
    const isClosed = topic.approval_status === '종료'

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
            {/* 뒤로가기 */}
            <Link href="/community" className="inline-block text-sm text-gray-400 hover:text-gray-600 mb-4">
                ← 커뮤니티 목록
            </Link>

            {/* 토론 주제 카드 — 보라색 계열로 이슈 댓글과 시각 구분 */}
            <div className="p-5 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl mb-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className={[
                        'text-xs px-2 py-0.5 rounded border font-medium',
                        isClosed
                            ? 'bg-gray-50 text-gray-500 border-gray-200'
                            : 'bg-purple-100 text-purple-700 border-purple-300',
                    ].join(' ')}>
                        {isClosed ? '종료' : '토론 중'}
                    </span>
                    {topic.is_ai_generated && (
                        <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-200">
                            AI 제안 주제
                        </span>
                    )}
                </div>

                {/* 토론 주제 본문 */}
                <p className="text-base md:text-lg font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap mb-3">
                    {topic.body}
                </p>

                <p className="text-xs text-gray-400">
                    {new Date(topic.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric',
                    })}
                </p>
            </div>

            {/* 연결된 이슈 */}
            {issueData && (
                <div className="mb-6 flex items-center gap-2 px-1">
                    <span className="text-xs text-gray-400">연결 이슈:</span>
                    <Link
                        href={`/issue/${issueData.id}`}
                        className="text-sm text-purple-600 underline underline-offset-2 hover:text-purple-800"
                    >
                        {issueData.title} →
                    </Link>
                </div>
            )}

            {/* 토론 댓글 영역 */}
            <div className="border border-purple-100 rounded-xl overflow-hidden">
                {/* 토론 영역 헤더 */}
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                    <p className="text-sm font-semibold text-purple-800">의견 나누기</p>
                    <p className="text-xs text-purple-600 mt-0.5">
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
