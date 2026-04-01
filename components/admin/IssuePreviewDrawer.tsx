/**
 * components/admin/IssuePreviewDrawer.tsx
 *
 * [관리자 이슈 미리보기 드로어]
 *
 * 이슈 승인 전 상세 페이지 구성을 오른쪽 드로어 형태로 미리 보여주는 컴포넌트입니다.
 * 이슈 기본 정보, 화력 지수, 타임라인, 출처를 표시하며
 * 하단에 승인·반려 액션 버튼을 제공합니다.
 *
 * 사용 예시:
 *   <IssuePreviewDrawer issue={selectedIssue} onClose={() => setSelected(null)} onApprove={handleApprove} onReject={handleReject} />
 */

'use client'

import { useEffect } from 'react'
import type { Issue } from '@/types/issue'
import TimelineEditor from '@/components/admin/TimelineEditor'
import SourcesSection from '@/components/issue/SourcesSection'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import { formatDate } from '@/lib/utils/format-date'

interface IssuePreviewDrawerProps {
    issue: Issue | null
    onClose: () => void
    onApprove: (id: string) => void
    onReject: (id: string) => void
}


export default function IssuePreviewDrawer({
    issue,
    onClose,
    onApprove,
    onReject,
}: IssuePreviewDrawerProps) {
    /* ESC 키로 닫기 */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    /* 드로어 열릴 때 body 스크롤 잠금 */
    useEffect(() => {
        if (issue) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [issue])

    if (!issue) return null

    const isPending = issue.approval_status === '대기'
    const isMerged = issue.approval_status === '병합됨'

    return (
        <>
            {/* 배경 오버레이 */}
            <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* 드로어 패널 */}
            <aside className="fixed top-0 right-0 h-full w-full max-w-2xl bg-surface z-50 flex flex-col shadow-2xl">
                {/* 헤더 */}
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary mb-1">미리보기</p>
                        <h2 className="text-lg font-bold text-content-primary leading-tight line-clamp-2">
                            {decodeHtml(issue.title)}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 mt-0.5 p-1.5 rounded-xl hover:bg-surface-muted text-content-muted hover:text-content-secondary"
                        aria-label="닫기"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 (스크롤 가능) */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {/* 배지 + 메타 + 설명 */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <StatusBadge status={issue.status} size="md" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-content-muted mb-2">
                            <span>{issue.category}</span>
                            <span>·</span>
                            <span>{formatDate(issue.created_at)}</span>
                        </div>
                        {issue.description && (
                            <p className="text-content-secondary leading-relaxed">
                                {decodeHtml(issue.description)}
                            </p>
                        )}
                    </div>

                    {/* 타임라인 편집 */}
                    <div className="card overflow-hidden">
                        <div className="px-4 py-3 border-b border-border-muted">
                            <h2 className="text-sm font-bold text-content-primary">타임라인</h2>
                        </div>
                        <div className="p-4">
                            <TimelineEditor issueId={issue.id} />
                        </div>
                    </div>

                    {/* 출처 */}
                    <SourcesSection issueId={issue.id} />
                </div>

                {/* 하단 액션 (대기 상태일 때만) */}
                {isPending && (
                    <div className="shrink-0 px-6 py-4 border-t border-border flex gap-3 bg-surface">
                        <button
                            onClick={() => { onApprove(issue.id); onClose() }}
                            className="flex-1 py-2.5 text-sm font-medium bg-green-500 text-white rounded-full hover:bg-green-600 whitespace-nowrap"
                        >
                            승인
                        </button>
                        <button
                            onClick={() => { onReject(issue.id); onClose() }}
                            className="flex-1 py-2.5 text-sm font-medium bg-orange-500 text-white rounded-full hover:bg-orange-600 whitespace-nowrap"
                        >
                            반려
                        </button>
                        <button
                            onClick={onClose}
                            className="btn-neutral btn-md px-5"
                        >
                            닫기
                        </button>
                    </div>
                )}
                {!isPending && !isMerged && (
                    <div className="shrink-0 px-6 py-4 border-t border-border bg-surface">
                        <button
                            onClick={onClose}
                            className="btn-neutral btn-md w-full"
                        >
                            닫기
                        </button>
                    </div>
                )}
                {isMerged && issue.merged_into_id && (
                    <div className="shrink-0 px-6 py-4 border-t border-border bg-surface flex gap-3">
                        <a
                            href={`/issue/${issue.merged_into_id}`}
                            target="_blank"
                            className="flex-1 py-2.5 text-sm font-medium text-center bg-primary text-white rounded-xl hover:bg-primary-dark"
                        >
                            병합된 이슈 보기
                        </a>
                        <button
                            onClick={onClose}
                            className="btn-neutral btn-md px-5"
                        >
                            닫기
                        </button>
                    </div>
                )}
            </aside>
        </>
    )
}
