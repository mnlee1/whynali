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

interface IssuePreviewDrawerProps {
    issue: Issue | null
    onClose: () => void
    onApprove: (id: string) => void
    onReject: (id: string) => void
}

const getHeatMeta = (heat: number | null | undefined): { label: string; className: string } => {
    if (heat == null) return { label: '-', className: 'text-gray-400' }
    if (heat >= 70) return { label: '높음', className: 'text-red-600' }
    if (heat >= 30) return { label: '보통', className: 'text-amber-600' }
    return { label: '낮음', className: 'text-gray-400' }
}

const STATUS_STYLE: Record<string, string> = {
    '점화': 'bg-red-50 text-red-600 border-red-200',
    '논란중': 'bg-orange-50 text-orange-600 border-orange-200',
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

    const heatMeta = getHeatMeta(issue.heat_index)
    const statusStyle = STATUS_STYLE[issue.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
    const isPending = issue.approval_status === '대기'

    return (
        <>
            {/* 배경 오버레이 */}
            <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* 드로어 패널 */}
            <aside className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white z-50 flex flex-col shadow-2xl">
                {/* 헤더 */}
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-neutral-200 shrink-0">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-600 mb-1">미리보기</p>
                        <h2 className="text-lg font-bold leading-tight line-clamp-2">
                            {decodeHtml(issue.title)}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 mt-0.5 p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        aria-label="닫기"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 (스크롤 가능) */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {/* 배지 + 설명 */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded border border-neutral-200 font-medium">
                                {issue.category}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusStyle}`}>
                                {issue.status}
                            </span>
                        </div>
                        {issue.description && (
                            <p className="text-gray-600 leading-relaxed text-sm">
                                {issue.description}
                            </p>
                        )}
                    </div>

                    {/* 화력 지수 */}
                    <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">화력 지수</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-orange-600">
                                    {(issue.heat_index ?? 0).toFixed(1)}
                                </span>
                                <span className={`text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded border border-orange-200 font-medium ${heatMeta.className}`}>
                                    {heatMeta.label}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 타임라인 편집 */}
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                            <p className="text-sm font-semibold text-neutral-800">타임라인</p>
                            <p className="text-xs text-gray-400 mt-0.5">포인트를 추가하면 이슈 상세 페이지에 즉시 반영됩니다.</p>
                        </div>
                        <div className="p-4">
                            <TimelineEditor issueId={issue.id} />
                        </div>
                    </div>

                    {/* 출처 */}
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                            <p className="text-sm font-semibold text-neutral-800">출처</p>
                        </div>
                        <div className="p-4">
                            <SourcesSection issueId={issue.id} />
                        </div>
                    </div>
                </div>

                {/* 하단 액션 (대기 상태일 때만) */}
                {isPending && (
                    <div className="shrink-0 px-6 py-4 border-t border-neutral-200 flex gap-3 bg-white">
                        <button
                            onClick={() => { onApprove(issue.id); onClose() }}
                            className="flex-1 py-2.5 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600"
                        >
                            승인
                        </button>
                        <button
                            onClick={() => { onReject(issue.id); onClose() }}
                            className="flex-1 py-2.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                            반려
                        </button>
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                            닫기
                        </button>
                    </div>
                )}
                {!isPending && (
                    <div className="shrink-0 px-6 py-4 border-t border-neutral-200 bg-white">
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                            닫기
                        </button>
                    </div>
                )}
            </aside>
        </>
    )
}
