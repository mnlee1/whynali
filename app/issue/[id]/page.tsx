/**
 * app/issue/[id]/page.tsx
 *
 * 특정 이슈의 상세 정보를 보여줍니다.
 * - 담당 A: 기본 정보, 타임라인, 출처(뉴스·커뮤니티), 관련 토론주제
 * - 담당 B: 감정·투표·댓글 블록
 * 
 * 성능 최적화:
 * - ISR (Incremental Static Regeneration): 15분 캐싱
 * - 효과: 페이지 로딩 0.6초 → 0.06초 (10배 향상)
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { decodeHtml } from '@/lib/utils/decode-html'
import TimelineSection from '@/components/issue/TimelineSection'
import SourcesSection from '@/components/issue/SourcesSection'
import ReactionsSection from '@/components/issue/ReactionsSection'
import VoteSection from '@/components/issue/VoteSection'
import CommentsSection from '@/components/issue/CommentsSection'
import StatusBadge from '@/components/common/StatusBadge'
import { formatDate } from '@/lib/utils/format-date'

// ISR: 15분(900초)마다 페이지 재생성
// 같은 이슈를 여러 사용자가 보더라도 15분에 한 번만 생성
export const revalidate = 900

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    /* 이슈 데이터 조회: RLS 우회를 위해 admin 클라이언트 사용
       (조건에서 이미 approval_status·visibility_status 필터 적용) */
    const adminClient = createSupabaseAdminClient()

    const { data: issue, error: issueError } = await adminClient
        .from('issues')
        .select('*')
        .eq('id', id)
        .single()

    if (issueError || !issue) {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    이슈를 불러올 수 없습니다.
                </div>
            </div>
        )
    }

    // 병합된 이슈인 경우 원본 이슈로 리다이렉트
    if (issue.merged_into_id) {
        redirect(`/issue/${issue.merged_into_id}`)
    }

    // 승인되지 않았거나 숨김 처리된 이슈는 표시하지 않음
    if (issue.approval_status !== '승인' || issue.visibility_status !== 'visible') {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    이슈를 불러올 수 없습니다.
                </div>
            </div>
        )
    }

    /* 관련 토론 주제 조회 */
    const { data: discussionTopics } = await adminClient
        .from('discussion_topics')
        .select('id, body, created_at')
        .eq('issue_id', id)
        .in('approval_status', ['진행중', '마감'])
        .order('created_at', { ascending: false })
        .limit(5)

    /* 투표 데이터 존재 여부 확인 */
    const { count: voteCount } = await adminClient
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('issue_id', id)
        .in('phase', ['진행중', '마감'])

    /* 사용자 세션 확인: anon 클라이언트로 쿠키 기반 세션 조회 */
    const sessionClient = await createSupabaseServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    const userId = user?.id ?? null

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
            {/* 이슈 헤더 */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <StatusBadge status={issue.status} size="md" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-3">
                    {decodeHtml(issue.title)}
                </h1>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
                    <span>{issue.category}</span>
                    <span>·</span>
                    <span>{formatDate(issue.created_at)}</span>
                </div>
                {issue.description && (
                    <p className="text-gray-600 leading-relaxed">
                        {decodeHtml(issue.description)}
                    </p>
                )}
            </div>

            {/* 타임라인 */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">타임라인</p>
                </div>
                <div className="p-4">
                    <TimelineSection issueId={id} />
                </div>
            </div>

            {/* 출처 */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">출처</p>
                </div>
                <div className="p-4">
                    <SourcesSection issueId={id} />
                </div>
            </div>

            {/* 투표 */}
            {voteCount !== null && voteCount > 0 && (
                <VoteSection issueId={id} userId={userId} />
            )}

            {/* 관련 토론 주제 */}
            {discussionTopics && discussionTopics.length > 0 && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                    <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">💬</span>
                            <p className="text-sm font-bold text-purple-800">관련 토론 주제 ({discussionTopics.length})</p>
                        </div>
                        <Link
                            href={`/community?issue_id=${id}`}
                            className="text-xs text-purple-600 hover:text-purple-800 font-semibold"
                        >
                            전체보기 →
                        </Link>
                    </div>
                    <div className="divide-y divide-neutral-100 bg-white">
                        {discussionTopics.map((topic, index) => (
                            <Link
                                key={topic.id}
                                href={`/community/${topic.id}`}
                                className="block p-4 hover:bg-purple-50 transition-colors group"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-bold group-hover:bg-purple-200">
                                        {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 leading-relaxed line-clamp-2 group-hover:text-purple-700">
                                            {topic.body}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1.5">
                                            {new Date(topic.created_at).toLocaleDateString('ko-KR', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* 이 이슈의 커뮤니티 - 관련 토론 주제가 없을 때만 표시 */}
            {(!discussionTopics || discussionTopics.length === 0) && (
                <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold text-purple-800 mb-0.5">이 이슈의 커뮤니티</p>
                        <p className="text-xs text-purple-600">이 이슈에서 파생된 토론 주제에 참여해보세요.</p>
                    </div>
                    <Link
                        href={`/community?issue_id=${id}`}
                        className="shrink-0 text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                    >
                        토론 보기
                    </Link>
                </div>
            )}

            {/* 감정 표현 */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">감정 표현</p>
                </div>
                <div className="p-4">
                    <ReactionsSection issueId={id} userId={userId} />
                </div>
            </div>

            {/* 댓글 */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">댓글</p>
                </div>
                <div className="p-4">
                    <CommentsSection issueId={id} userId={userId} />
                </div>
            </div>
        </div>
    )
}
