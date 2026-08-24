'use client'

/**
 * components/issue/PopularComments.tsx
 *
 * "이 분야, 지금 인기 댓글" 카드 - 같은 카테고리 내 인기 댓글 발췌(닉네임+시간+본문+소속 이슈).
 * 카테고리로 관련성을 줘서 "왜 이 이슈 페이지에 이게 있는지" 맥락이 생기게 함.
 * /api/comments/popular를 클라이언트에서 매번 새로 호출(ISR 캐시와 무관하게 항상 최신 상태 반영,
 * 삭제/수정된 댓글이 오래 남아있지 않도록).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NicknameAvatar from '@/components/common/NicknameAvatar'
import { formatDate } from '@/lib/utils/format-date'

interface PopularComment {
    id: string
    body: string
    authorLabel: string
    issueId: string
    issueTitle: string
    createdAt: string
}

interface Props {
    currentIssueId: string
    category: string
}

export default function PopularComments({ currentIssueId, category }: Props) {
    const [comments, setComments] = useState<PopularComment[] | null>(null)

    useEffect(() => {
        fetch(`/api/comments/popular?exclude_issue_id=${currentIssueId}&category=${encodeURIComponent(category)}&limit=3`)
            .then((r) => r.ok ? r.json() : null)
            .then((json) => { if (json) setComments(json.data ?? []) })
            .catch(() => setComments([]))
    }, [currentIssueId, category])

    if (comments !== null && comments.length === 0) return null

    return (
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted">
                <h2 className="text-sm font-bold text-content-primary">이 분야, 지금 인기 댓글</h2>
            </div>
            <div className="p-2 space-y-3">
                {comments === null && (
                    <>
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="p-2 animate-pulse">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="w-5 h-5 rounded-full bg-surface-muted shrink-0" />
                                    <span className="h-3 w-20 rounded bg-surface-muted" />
                                    <span className="h-3 w-12 rounded bg-surface-muted" />
                                </div>
                                <div className="h-11 rounded-xl rounded-tl-none bg-surface-muted mb-1.5" />
                                <span className="block h-2.5 w-24 rounded bg-surface-muted" />
                            </div>
                        ))}
                    </>
                )}
                {comments?.map((comment) => (
                    <Link
                        key={comment.id}
                        href={`/issue/${comment.issueId}#comment-${comment.id}`}
                        className="block p-2 rounded-xl"
                    >
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <NicknameAvatar name={comment.authorLabel} size="sm" />
                            <span className="text-xs font-semibold text-content-primary truncate">{comment.authorLabel}</span>
                            <span className="text-xs text-content-muted shrink-0">· {formatDate(comment.createdAt)}</span>
                        </div>
                        <div className="relative bg-surface-muted rounded-xl rounded-tl-none px-3 py-2 mb-1.5">
                            <p className="text-sm font-medium text-content-primary leading-snug line-clamp-2">
                                <span className="text-content-muted">&ldquo;</span>
                                {comment.body}
                                <span className="text-content-muted">&rdquo;</span>
                            </p>
                        </div>
                        <p className="text-xs text-content-muted truncate text-right">{comment.issueTitle}</p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
