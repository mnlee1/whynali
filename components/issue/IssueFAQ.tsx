/**
 * components/issue/IssueFAQ.tsx
 * 
 * [이슈 FAQ 컴포넌트]
 * 
 * AI 검색 엔진(ChatGPT, Perplexity)이 이슈의 핵심 정보를 쉽게 파악할 수 있도록
 * FAQ 형식으로 구조화된 정보를 제공합니다.
 * 
 * AEO (Answer Engine Optimization) 전략:
 * - 명확한 질문-답변 구조
 * - 시맨틱 HTML (dl, dt, dd 태그)
 * - 간결하고 직접적인 답변
 */

'use client'

import type { Issue } from '@/types/issue'

interface IssueFAQProps {
    issue: Issue
    newsCount?: number
    communityCount?: number
    reactionCount?: number
    commentCount?: number
}

export default function IssueFAQ({
    issue,
    newsCount = 0,
    communityCount = 0,
    reactionCount = 0,
    commentCount = 0,
}: IssueFAQProps) {
    const statusDescriptions: Record<string, string> = {
        '점화': '이슈가 막 시작되어 빠르게 확산되고 있는 단계입니다.',
        '논란중': '많은 사람들이 주목하고 활발히 논의되고 있는 단계입니다.',
        '종결': '이슈가 진정되어 더 이상 큰 관심을 받지 않는 단계입니다.',
    }

    const categoryDescriptions: Record<string, string> = {
        '연예': '연예계 인물이나 작품과 관련된',
        '스포츠': '스포츠 선수, 팀, 경기와 관련된',
        '정치': '정치인, 정부, 국회와 관련된',
        '사회': '사회적 사건, 현상과 관련된',
        '경제': '경제, 기업, 금융과 관련된',
        '기술': 'IT, 과학, 기술과 관련된',
        '세계': '국제적 사건, 해외 뉴스와 관련된',
    }

    const relativeTime = (date: string) => {
        const now = new Date()
        const past = new Date(date)
        const diffMs = now.getTime() - past.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffHours / 24)

        if (diffHours < 1) return '방금 전'
        if (diffHours < 24) return `${diffHours}시간 전`
        if (diffDays < 7) return `${diffDays}일 전`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`
        return `${Math.floor(diffDays / 30)}개월 전`
    }

    return (
        <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-border-muted bg-surface">
                <h2 className="text-sm font-bold text-content-primary">이슈 요약</h2>
            </div>
            <div className="p-4">
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="font-semibold text-content-primary mb-1">
                            이 이슈는 무엇인가요?
                        </dt>
                        <dd className="text-content-secondary leading-relaxed">
                            {issue.topic_description || `${categoryDescriptions[issue.category] || ''} 이슈입니다.`}
                        </dd>
                    </div>

                    <div>
                        <dt className="font-semibold text-content-primary mb-1">
                            현재 상황은 어떤가요?
                        </dt>
                        <dd className="text-content-secondary leading-relaxed">
                            현재 <strong className="text-content-primary">{issue.status}</strong> 상태입니다. {statusDescriptions[issue.status]}
                        </dd>
                    </div>

                    <div>
                        <dt className="font-semibold text-content-primary mb-1">
                            언제 시작되었나요?
                        </dt>
                        <dd className="text-content-secondary leading-relaxed">
                            {relativeTime(issue.created_at)} ({new Date(issue.created_at).toLocaleDateString('ko-KR')})에 이슈가 시작되었습니다.
                        </dd>
                    </div>

                    <div>
                        <dt className="font-semibold text-content-primary mb-1">
                            얼마나 많은 관심을 받고 있나요?
                        </dt>
                        <dd className="text-content-secondary leading-relaxed">
                            화력 지수 <strong className="text-content-primary">{issue.heat_index ?? 0}점</strong>으로 
                            {(issue.heat_index ?? 0) >= 50 ? ' 매우 높은' : (issue.heat_index ?? 0) >= 30 ? ' 높은' : ' 보통'} 관심을 받고 있습니다.
                            {newsCount > 0 && ` 관련 뉴스 ${newsCount}건,`}
                            {communityCount > 0 && ` 커뮤니티 글 ${communityCount}건,`}
                            {reactionCount > 0 && ` 반응 ${reactionCount}개,`}
                            {commentCount > 0 && ` 댓글 ${commentCount}개가 등록되어 있습니다.`}
                        </dd>
                    </div>

                    {issue.category && (
                        <div>
                            <dt className="font-semibold text-content-primary mb-1">
                                어떤 분야의 이슈인가요?
                            </dt>
                            <dd className="text-content-secondary leading-relaxed">
                                <strong className="text-content-primary">{issue.category}</strong> 카테고리의 이슈입니다.
                            </dd>
                        </div>
                    )}
                </dl>
            </div>
        </div>
    )
}
