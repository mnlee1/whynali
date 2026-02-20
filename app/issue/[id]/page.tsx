/**
 * app/issue/[id]/page.tsx
 *
 * 특정 이슈의 상세 정보를 보여줍니다.
 * - 담당 A: 기본 정보, 화력 지수, 타임라인, 출처(뉴스·커뮤니티)
 * - 담당 B: 감정·투표·댓글 블록
 */

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import TimelineSection from '@/components/issue/TimelineSection'
import SourcesSection from '@/components/issue/SourcesSection'
import ReactionsSection from '@/components/issue/ReactionsSection'
import VoteSection from '@/components/issue/VoteSection'
import CommentsSection from '@/components/issue/CommentsSection'

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const admin = createSupabaseAdminClient()
    const { data: issue, error: issueError } = await admin
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

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const getHeatLevel = (heat: number): string => {
        if (heat >= 70) return '높음'
        if (heat >= 30) return '보통'
        return '낮음'
    }

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
            {/* 이슈 헤더 */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                        {issue.category}
                    </span>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
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
            <div className="mb-8 p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">화력 지수</span>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-orange-600">
                            {(issue.heat_index ?? 0).toFixed(1)}
                        </span>
                        <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                            {getHeatLevel(issue.heat_index)}
                        </span>
                    </div>
                </div>
            </div>

            {/* 감정 표현 */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">감정 표현</h2>
                <ReactionsSection issueId={id} userId={userId} />
            </div>

            {/* 타임라인 섹션 */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">타임라인</h2>
                <TimelineSection issueId={id} />
            </div>

            {/* 출처 섹션 */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">출처</h2>
                <SourcesSection issueId={id} />
            </div>

            {/* 투표 */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">투표</h2>
                <VoteSection issueId={id} userId={userId} />
            </div>

            {/* 댓글 */}
            <div className="mt-12 pt-8 border-t border-gray-200">
                <h2 className="text-xl font-bold mb-4">댓글</h2>
                <CommentsSection issueId={id} userId={userId} />
            </div>
        </div>
    )
}
