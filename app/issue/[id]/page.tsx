/**
 * app/issue/[id]/page.tsx
 *
 * 특정 이슈의 상세 정보를 보여줍니다.
 * - 담당 A: 기본 정보, 화력 지수, 타임라인, 출처(뉴스·커뮤니티)
 * - 담당 B: 감정·투표·댓글 블록
 */

import Link from 'next/link'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import TimelineSection from '@/components/issue/TimelineSection'
import SourcesSection from '@/components/issue/SourcesSection'
import ReactionsSection from '@/components/issue/ReactionsSection'
import VoteSection from '@/components/issue/VoteSection'
import CommentsSection from '@/components/issue/CommentsSection'

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    /* 이슈 데이터 조회: RLS 우회를 위해 admin 클라이언트 사용
       (조건에서 이미 approval_status·visibility_status 필터 적용) */
    const adminClient = createSupabaseAdminClient()

    const { data: issue, error: issueError } = await adminClient
        .from('issues')
        .select('*')
        .eq('id', id)
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
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

    /* 사용자 세션 확인: anon 클라이언트로 쿠키 기반 세션 조회 */
    const sessionClient = await createSupabaseServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    const userId = user?.id ?? null

    const getHeatLevel = (heat: number): string => {
        if (heat >= 70) return '높음'
        if (heat >= 30) return '보통'
        return '낮음'
    }

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
            {/* 이슈 헤더 */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded border border-neutral-200 font-medium">
                        {issue.category}
                    </span>
                    <span className={[
                        'text-xs px-2 py-0.5 rounded border font-medium',
                        issue.status === '점화'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : issue.status === '논란중'
                                ? 'bg-orange-50 text-orange-600 border-orange-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200',
                    ].join(' ')}>
                        {issue.status}
                    </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                    {issue.title}
                </h1>
                {issue.description && (
                    <p className="text-gray-600 leading-relaxed">
                        {issue.description}
                    </p>
                )}
            </div>

            {/* 화력 지수 */}
            <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">화력 지수</span>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-orange-600">
                            {(issue.heat_index ?? 0).toFixed(1)}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded border border-orange-200 font-medium">
                            {getHeatLevel(issue.heat_index)}
                        </span>
                    </div>
                </div>
            </div>

            {/* 감정 표현 */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">감정 표현</p>
                </div>
                <div className="p-4">
                    <ReactionsSection issueId={id} userId={userId} />
                </div>
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
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">투표</p>
                </div>
                <div className="p-4">
                    <VoteSection issueId={id} userId={userId} />
                </div>
            </div>

            {/* 이 이슈의 커뮤니티 */}
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
