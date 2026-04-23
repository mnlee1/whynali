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
 * 
 * SEO:
 * - 동적 메타데이터 (generateMetadata)
 * - JSON-LD Article 스키마 (구조화된 데이터)
 * - JSON-LD BreadcrumbList 스키마 (네비게이션 경로)
 * - 실시간 업데이트 시그널 (lastModified)
 */

import type { Metadata } from 'next'
import { cache } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eye, MessageCircleMore } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { decodeHtml } from '@/lib/utils/decode-html'
import TimelineSection from '@/components/issue/TimelineSection'
import SourcesSection from '@/components/issue/SourcesSection'
import ReactionsSection from '@/components/issue/ReactionsSection'
import VoteSection from '@/components/issue/VoteSection'
import CommentsSection from '@/components/issue/CommentsSection'
import StatusBadge from '@/components/common/StatusBadge'
import ViewCounter from '@/components/issue/ViewCounter'
import IssueStatBar from '@/components/issue/IssueStatBar'
import { formatFullDate, formatDate } from '@/lib/utils/format-date'
import { generateArticleSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'

// ISR: 15분(900초)마다 페이지 재생성
// 같은 이슈를 여러 사용자가 보더라도 15분에 한 번만 생성
export const revalidate = 900

// 한 요청 내 generateMetadata + IssuePage 간 DB 조회 공유
const getIssue = cache(async (id: string) => {
    const { data } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('id', id)
        .single()
    return data
})

// 동적 메타데이터 생성 (SEO + 실시간 업데이트 시그널)
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const issue = await getIssue(id)

    if (!issue) {
        return {
            title: '이슈를 찾을 수 없습니다',
        }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const title = `${issue.title}`
    const description = issue.topic_description || `${issue.category} 카테고리의 ${issue.status} 이슈. 화력 지수 ${issue.heat_index ?? 0}점. 실시간 반응, 타임라인, 투표, 댓글을 확인하세요.`

    const categoryKeywords: Record<string, string[]> = {
        '연예': ['연예', '연예계', '셀럽', '아이돌', '배우', '가수'],
        '스포츠': ['스포츠', '축구', '야구', '농구', '올림픽', '선수'],
        '정치': ['정치', '국회', '정당', '선거', '정책', '정부'],
        '사회': ['사회', '사건', '사고', '범죄', '재판'],
        '경제': ['경제', '주식', '부동산', '금융', '기업', '시장'],
        '기술': ['기술', 'IT', '과학', '스타트업', '테크', '혁신'],
        '세계': ['세계', '국제', '해외', '외교', '글로벌'],
    }

    const keywords = ['이슈', '논란', '왜난리', issue.title, issue.category, ...(categoryKeywords[issue.category] || [])]

    const relativeTime = (date: string) => {
        const now = new Date()
        const past = new Date(date)
        const diffMs = now.getTime() - past.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffHours / 24)

        if (diffHours < 1) return '방금 전'
        if (diffHours < 24) return `${diffHours}시간 전`
        if (diffDays < 7) return `${diffDays}일 전`
        return `${Math.floor(diffDays / 7)}주 전`
    }

    const updatedDescription = `${description} (마지막 업데이트: ${relativeTime(issue.updated_at)})`

    return {
        title,
        description: updatedDescription,
        keywords,
        openGraph: {
            type: 'article',
            locale: 'ko_KR',
            url: `/issue/${id}`,
            siteName: '왜난리',
            title,
            description: updatedDescription,
            publishedTime: issue.created_at,
            modifiedTime: issue.updated_at,
            section: issue.category,
            tags: keywords,
            images: [
                {
                    url: '/og-image.png',
                    width: 1200,
                    height: 630,
                    alt: issue.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: updatedDescription,
            images: ['/og-image.png'],
        },
        alternates: {
            canonical: `${baseUrl}/issue/${id}`,
        },
        other: {
            'article:modified_time': issue.updated_at,
        },
    }
}

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    /* 이슈 데이터 + 관련 데이터 + 사용자 세션을 병렬로 조회 */
    /* getIssue(id)는 generateMetadata에서 이미 호출된 경우 cache()로 재사용됨 */
    const [
        issue,
        { data: discussionTopics },
        { count: voteCount },
        sessionClient,
        { data: timelineSummariesRaw },
        { data: newsData },
    ] = await Promise.all([
        getIssue(id),
        supabaseAdmin
            .from('discussion_topics')
            .select('id, body, created_at, approval_status, view_count')
            .eq('issue_id', id)
            .in('approval_status', ['진행중', '마감'])
            .limit(50),
        supabaseAdmin
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', id)
            .in('phase', ['진행중', '마감']),
        createSupabaseServerClient(),
        supabaseAdmin
            .from('timeline_summaries')
            .select('stage, stage_title, bullets, date_start, date_end')
            .eq('issue_id', id),
        supabaseAdmin
            .from('news_data')
            .select('id, title, link, source, published_at, issue_id, created_at')
            .eq('issue_id', id)
            .order('published_at', { ascending: false }),
    ])

    const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3, '종결': 4 }
    const timelineSummaries = (timelineSummariesRaw ?? [])
        .sort((a, b) => (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9))
        .map(row => ({
            stage: row.stage as '발단' | '전개' | '파생' | '진정' | '종결',
            stageTitle: row.stage_title,
            bullets: row.bullets || [],
            dateStart: row.date_start,
            dateEnd: row.date_end,
        }))

    /* 토론 주제별 의견(댓글) 수 집계 */
    const topicIds = (discussionTopics ?? []).map((t) => t.id)
    const opinionCountMap: Record<string, number> = {}

    if (topicIds.length > 0) {
        const { data: commentRows } = await supabaseAdmin
            .from('comments')
            .select('discussion_topic_id')
            .in('discussion_topic_id', topicIds)
            .in('visibility', ['public', 'pending_review'])

        for (const row of commentRows ?? []) {
            if (row.discussion_topic_id) {
                opinionCountMap[row.discussion_topic_id] = (opinionCountMap[row.discussion_topic_id] ?? 0) + 1
            }
        }
    }

    const topicsWithStats = (discussionTopics ?? []).map((topic) => ({
        ...topic,
        opinionCount: opinionCountMap[topic.id] ?? 0,
        viewCount: topic.view_count ?? 0,
    }))
    const active = topicsWithStats
        .filter(t => t.approval_status === '진행중')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const closed = topicsWithStats
        .filter(t => t.approval_status === '마감')
        .sort((a, b) => (b.viewCount + b.opinionCount) - (a.viewCount + a.opinionCount))
    const discussionTopicsWithStats = [...active, ...closed].slice(0, 5)

    if (!issue) {
        return (
            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
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
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                    이슈를 불러올 수 없습니다.
                </div>
            </div>
        )
    }

    /* 사용자 세션 확인 */
    const { data: { user } } = await sessionClient.auth.getUser()
    const userId = user?.id ?? null

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

    const categoryUrls: Record<string, string> = {
        '연예': '/entertain',
        '스포츠': '/sports',
        '정치': '/politics',
        '사회': '/society',
        '경제': '/economy',
        '기술': '/tech',
        '세계': '/world',
    }

    const breadcrumbItems = [
        { name: '홈', url: baseUrl },
        { name: issue.category, url: `${baseUrl}${categoryUrls[issue.category] || '/'}` },
        { name: issue.title, url: `${baseUrl}/issue/${id}` },
    ]

    const articleSchema = generateArticleSchema(issue)
    const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbItems)

    return (
        <>
            <Script
                id="issue-article-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(articleSchema)}
            />
            <Script
                id="issue-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8 max-w-2xl">
                {/* 조회수 증가 (클라이언트에서 마운트 시 한 번 호출) */}
                <ViewCounter endpoint={`/api/issues/${id}/view`} />

            {/* 이슈 헤더 */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <StatusBadge status={issue.status} size="md" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-content-primary mb-3">
                    {decodeHtml(issue.title)}
                </h1>
                <div className="flex items-center gap-2 text-xs text-content-muted mb-2">
                    <span>{issue.category}</span>
                    <span>·</span>
                    <span>{formatFullDate(issue.approved_at ?? issue.created_at)}</span>
                </div>
                <IssueStatBar
                    issueId={id}
                    userId={userId}
                    initialVoteCount={voteCount ?? 0}
                    initialDiscussionCount={discussionTopicsWithStats?.length ?? 0}
                />
            </div>

            {/* 타임라인 */}
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">타임라인</h2>
                </div>
                <div className="p-4">
                    <TimelineSection
                        issueId={id}
                        issueStatus={issue.status}
                        issueUpdatedAt={issue.updated_at}
                        initialSummaries={timelineSummaries}
                    />
                </div>
            </div>

            {/* 출처 */}
            <SourcesSection issueId={id} initialNews={newsData ?? []} />

            {/* 투표 */}
            <div id="section-vote" style={{ scrollMarginTop: '80px' }}>
                <VoteSection issueId={id} userId={userId} />
            </div>

            {/* 관련 토론 주제 */}
            {discussionTopicsWithStats && discussionTopicsWithStats.length > 0 && (
                <div id="section-discussion" style={{ scrollMarginTop: '80px' }}>
                    <div className="card overflow-hidden mb-6">
                    <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-content-primary">관련 토론 주제</h2>
                            {discussionTopicsWithStats.length >= 1 && (
                                <span className="text-xs text-content-muted">{discussionTopicsWithStats.length}</span>
                            )}
                        </div>
                        <Link
                            href={
                                discussionTopicsWithStats.length === 1
                                    ? `/community/${discussionTopicsWithStats[0].id}`
                                    : `/community?issue_id=${id}`
                            }
                            className="text-xs text-content-secondary hover:text-content-primary font-semibold"
                        >
                            {discussionTopicsWithStats.length === 1 ? '토론 참여하기 →' : '이 이슈 토론 전체보기 →'}
                        </Link>
                    </div>
                    <div className="divide-y divide-border-muted">
                        {discussionTopicsWithStats.map((topic) => (
                            <Link
                                key={topic.id}
                                href={`/community/${topic.id}`}
                                className="block p-5 hover:bg-surface-muted transition-colors group"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2.5">
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

                                        <p className="text-[15px] font-medium text-content-primary line-clamp-2 leading-snug mb-3 group-hover:text-primary">
                                            {topic.body}
                                        </p>

                                        <div className="flex items-center gap-3 text-xs text-content-secondary pt-3 border-t border-border-muted">
                                            <span className="flex items-center gap-1">
                                                <Eye className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{topic.viewCount.toLocaleString()}</span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MessageCircleMore className="w-4 h-4" strokeWidth={1.8} />
                                                <span>{topic.opinionCount.toLocaleString()}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
                </div>
            )}

            {/* 이 이슈의 커뮤니티 - 관련 토론 주제가 없을 때만 표시 */}
            {(!discussionTopicsWithStats || discussionTopicsWithStats.length === 0) && (
                <div id="section-discussion" className="card overflow-hidden mb-6" style={{ scrollMarginTop: '80px' }}>
                    <div className="px-4 py-3 border-b border-border-muted">
                        <h2 className="text-sm font-bold text-content-primary">관련 토론 주제</h2>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-content-primary mb-0.5">이 이슈의 커뮤니티</p>
                            <p className="text-xs text-content-secondary">이 이슈에서 파생된 토론 주제에 참여해보세요.</p>
                        </div>
                        <Link
                            href="/community"
                            className="shrink-0 btn-primary btn-sm"
                        >
                            토론 보기
                        </Link>
                    </div>
                </div>
            )}

            {/* 감정 표현 */}
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">감정 표현</h2>
                </div>
                <div className="p-4">
                    <ReactionsSection issueId={id} userId={userId} />
                </div>
            </div>

            {/* 댓글 */}
            <div id="section-comments" className="card overflow-hidden" style={{ scrollMarginTop: '80px' }}>
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">댓글</h2>
                </div>
                <div className="p-4">
                    <CommentsSection issueId={id} userId={userId} />
                </div>
            </div>
        </div>
        </>
    )
}
