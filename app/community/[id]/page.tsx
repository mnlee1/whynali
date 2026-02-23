import Link from 'next/link'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import CommentsSection from '@/components/issue/CommentsSection'

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
            <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
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

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
            {/* 뒤로가기 */}
            <Link href="/community" className="inline-block text-sm text-gray-500 hover:text-gray-700 mb-4">
                ← 커뮤니티 목록
            </Link>

            {/* 토론 주제 본문 */}
            <div className="p-5 border border-gray-200 rounded-lg mb-6">
                {/* 상태 배지 행
                    표시 규칙: '승인' → 진행중(초록), '종료' → 종료(회색)
                    관리자가 반려 처리 시 이 페이지는 404로 전환됨 */}
                <div className="flex items-center gap-2 mb-3">
                    <span className={[
                        'text-xs px-2 py-0.5 rounded border',
                        topic.approval_status === '종료'
                            ? 'bg-gray-50 text-gray-500 border-gray-200'
                            : 'bg-green-50 text-green-700 border-green-200',
                    ].join(' ')}>
                        {topic.approval_status === '종료' ? '종료' : '진행중'}
                    </span>
                    {topic.is_ai_generated && (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-200">
                            AI 생성 주제
                        </span>
                    )}
                </div>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {topic.body}
                </p>
                <p className="text-xs text-gray-400 mt-3">
                    {new Date(topic.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}
                </p>
            </div>

            {/* 연결된 이슈 */}
            {issueData && (
                <div className="mb-8 flex items-center gap-2">
                    <span className="text-sm text-gray-500">연결된 이슈:</span>
                    <Link
                        href={`/issue/${issueData.id}`}
                        className="text-sm text-blue-600 underline hover:text-blue-800"
                    >
                        {issueData.title} →
                    </Link>
                </div>
            )}

            {/* 댓글 */}
            <div className="pt-2">
                <h2 className="text-lg font-bold mb-4">댓글</h2>
                <CommentsSection
                    discussionTopicId={id}
                    userId={userId}
                    isClosed={topic.approval_status === '종료'}
                />
            </div>
        </div>
    )
}
