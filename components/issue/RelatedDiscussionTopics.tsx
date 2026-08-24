'use client'

/**
 * components/issue/RelatedDiscussionTopics.tsx
 *
 * "관련 토론 주제" 리스트 — 항목 클릭 시 풀페이지 이동(/community/[id]) 대신
 * Drawer로 열어서 이슈 상세 맥락을 유지한 채 토론에 참여할 수 있게 한다.
 * "더 많은 토론 보기"는 그대로 /community 전체 목록으로 이동(변경 없음).
 */

import { useState } from 'react'
import Link from 'next/link'
import { Eye, MessageCircleMore } from 'lucide-react'
import Drawer from '@/components/common/Drawer'
import DiscussionComments from '@/components/issue/DiscussionComments'

interface Topic {
    id: string
    body: string
    approval_status: string
    viewCount: number
    opinionCount: number
}

interface Props {
    topics: Topic[]
    issueId: string
    issueTitle: string
    userId: string | null
}

export default function RelatedDiscussionTopics({ topics, issueId, issueTitle, userId }: Props) {
    const [openTopic, setOpenTopic] = useState<Topic | null>(null)

    return (
        <>
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-content-primary">관련 토론 주제</h2>
                        {topics.length >= 1 && (
                            <span className="text-xs text-content-muted">{topics.length}</span>
                        )}
                    </div>
                    <Link
                        href="/community"
                        className="text-xs text-content-secondary hover:text-content-primary font-semibold"
                    >
                        더 많은 토론 보기 →
                    </Link>
                </div>
                <div className="divide-y divide-border-muted">
                    {topics.map((topic) => (
                        <button
                            key={topic.id}
                            type="button"
                            onClick={() => setOpenTopic(topic)}
                            className="block w-full text-left p-5 hover:bg-surface-muted transition-colors group"
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
                        </button>
                    ))}
                </div>
            </div>

            <Drawer isOpen={!!openTopic} onClose={() => setOpenTopic(null)} title="토론">
                {openTopic && (
                    <div className="p-4">
                        <p className="text-[15px] font-medium text-content-primary leading-snug mb-4">
                            {openTopic.body}
                        </p>
                        <DiscussionComments
                            discussionTopicId={openTopic.id}
                            issueId={issueId}
                            issueTitle={issueTitle}
                            userId={userId}
                            isClosed={openTopic.approval_status === '마감'}
                        />
                    </div>
                )}
            </Drawer>
        </>
    )
}
