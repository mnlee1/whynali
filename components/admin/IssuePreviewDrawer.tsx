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

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { Issue } from '@/types/issue'
import TimelineSection from '@/components/issue/TimelineSection'
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
    onIssueUpdate?: () => void
}


export default function IssuePreviewDrawer({
    issue,
    onClose,
    onApprove,
    onReject,
    onIssueUpdate,
}: IssuePreviewDrawerProps) {
    const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number>(0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [localThumbnailUrls, setLocalThumbnailUrls] = useState<string[]>([])
    const [refreshSuccess, setRefreshSuccess] = useState(false)
    const [timelineTab, setTimelineTab] = useState<'preview' | 'manage'>('preview')
    const [summaryKey, setSummaryKey] = useState(0)
    const [sourcesKey, setSourcesKey] = useState(0)
    const [isRegenerating, setIsRegenerating] = useState(false)

    useEffect(() => {
        if (issue) {
            setSelectedThumbnailIndex(issue.primary_thumbnail_index ?? 0)
            setLocalThumbnailUrls(issue.thumbnail_urls ?? [])
            setTimelineTab('preview')
            setSummaryKey(0)
            setSourcesKey(0)
        }
    }, [issue])

    // 포인트 삭제 후 요약 재생성 → 유저뷰로 전환
    const handleTimelineDeleteSuccess = async () => {
        if (!issue) return
        setIsRegenerating(true)
        try {
            await fetch(
                `/api/admin/migrations/regenerate-single-timeline?issueId=${issue.id}`,
                { method: 'POST' }
            )
        } catch {
            // 재생성 실패해도 탭은 전환 (다음 cron에서 자동 갱신됨)
        } finally {
            setSummaryKey(k => k + 1)
            setSourcesKey(k => k + 1)
            setTimelineTab('preview')
            setIsRegenerating(false)
        }
    }

    const handleRegenerateSummary = async () => {
        if (!issue || isRegenerating) return
        setIsRegenerating(true)
        try {
            const res = await fetch(
                `/api/admin/migrations/regenerate-single-timeline?issueId=${issue.id}`,
                { method: 'POST' }
            )
            if (!res.ok) {
                let msg = `HTTP ${res.status}`
                try {
                    const body = await res.json()
                    msg += `: ${body.error ?? body.message ?? JSON.stringify(body)}`
                } catch {
                    msg += ` (응답 파싱 실패)`
                }
                throw new Error(msg)
            }
            setSummaryKey(k => k + 1)
            setTimelineTab('preview')
        } catch (e) {
            alert(`요약 재생성 실패\n${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setIsRegenerating(false)
        }
    }

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

    const handlePrimaryThumbnailChange = async (index: number) => {
        if (!issue) return
        setSelectedThumbnailIndex(index)

        try {
            const res = await fetch(`/api/admin/issues/${issue.id}/primary-thumbnail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index }),
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || '대표 이미지 설정 실패')
            }

            onIssueUpdate?.()
        } catch (error) {
            console.error('대표 이미지 설정 에러:', error)
            alert(error instanceof Error ? error.message : '대표 이미지 설정에 실패했습니다')
            setSelectedThumbnailIndex(issue.primary_thumbnail_index ?? 0)
        }
    }

    const handleRefreshThumbnails = async () => {
        if (!issue) return
        setIsRefreshing(true)

        try {
            const res = await fetch(`/api/admin/issues/${issue.id}/refresh-thumbnails`, {
                method: 'POST',
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || '이미지 재검색 실패')
            }

            const data = await res.json()
            setLocalThumbnailUrls(data.thumbnail_urls ?? [])
            setSelectedThumbnailIndex(0)
            setRefreshSuccess(true)
            setTimeout(() => setRefreshSuccess(false), 2000)
        } catch (error) {
            console.error('이미지 재검색 에러:', error)
            alert(error instanceof Error ? error.message : '이미지 재검색에 실패했습니다')
        } finally {
            setIsRefreshing(false)
        }
    }

    const handleRemoveThumbnails = async () => {
        if (!issue) return
        if (!confirm('대표 이미지 선택을 해제하고 그라데이션 배경을 사용하겠습니까?\n이미지는 삭제되지 않으며 다시 클릭해 선택할 수 있습니다.')) return

        try {
            const res = await fetch(`/api/admin/issues/${issue.id}/remove-thumbnails`, {
                method: 'POST',
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || '이미지 해제 실패')
            }

            setSelectedThumbnailIndex(-1)
            onIssueUpdate?.()
        } catch (error) {
            console.error('이미지 해제 에러:', error)
            alert(error instanceof Error ? error.message : '이미지 해제에 실패했습니다')
        }
    }

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
                    </div>

                    {/* 이미지 미리보기 */}
                    <div className="card overflow-hidden">
                        <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
                            <h2 className="text-sm font-bold text-content-primary">
                                대표 이미지
                                {localThumbnailUrls.length > 0 && (
                                    <span className="ml-2 text-xs font-normal text-content-muted">({localThumbnailUrls.length}개)</span>
                                )}
                            </h2>
                            <div className="flex items-center gap-2">
                                {refreshSuccess && (
                                    <span className="text-xs text-green-600 font-medium">✓ 완료</span>
                                )}
                                <button
                                    onClick={handleRefreshThumbnails}
                                    disabled={isRefreshing}
                                    className="px-3 py-1.5 text-xs font-medium bg-surface-muted hover:bg-border text-content-secondary rounded-lg disabled:opacity-50"
                                >
                                    {isRefreshing ? '검색 중...' : localThumbnailUrls.length > 0 ? '이미지 재검색' : '이미지 검색'}
                                </button>
                                {localThumbnailUrls.length > 0 && selectedThumbnailIndex >= 0 && (
                                    <button
                                        onClick={handleRemoveThumbnails}
                                        className="px-3 py-1.5 text-xs font-medium bg-surface-muted hover:bg-border text-content-secondary rounded-lg"
                                    >
                                        그라데이션 배경 사용
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="p-4 space-y-3">
                            {localThumbnailUrls.length === 0 ? (
                                <p className="text-xs text-content-muted text-center py-4">
                                    이미지가 없습니다. &apos;이미지 검색&apos; 버튼을 눌러 Pixabay에서 검색하세요.
                                </p>
                            ) : selectedThumbnailIndex < 0 ? (
                                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                                    그라데이션 배경 사용 중 — 이미지를 클릭하면 대표로 설정됩니다
                                </p>
                            ) : (
                                <p className="text-xs text-content-muted">
                                    슬라이드에 표시할 대표 이미지를 선택하세요
                                </p>
                            )}
                            {localThumbnailUrls.length > 0 && (
                                <div className="grid grid-cols-3 gap-3">
                                    {localThumbnailUrls.map((url, i) => (
                                        <label key={url} className="block cursor-pointer group">
                                            <div className={`relative aspect-video rounded-lg overflow-hidden ring-2 transition-all ${selectedThumbnailIndex === i ? 'ring-primary shadow-lg' : 'ring-transparent hover:ring-border'}`}>
                                                <Image src={url} alt={`이미지 ${i + 1}`} fill sizes="200px" className="object-cover" />
                                                <input
                                                    type="radio"
                                                    name="thumbnail"
                                                    checked={selectedThumbnailIndex === i}
                                                    onChange={() => handlePrimaryThumbnailChange(i)}
                                                    className="absolute top-2 left-2 w-4 h-4 accent-primary"
                                                />
                                                {selectedThumbnailIndex === i && (
                                                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                                        <span className="px-2 py-1 bg-primary text-white text-xs font-bold rounded">
                                                            대표
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 타임라인 — 유저뷰/포인트 관리 탭 */}
                    <div className="card overflow-hidden">
                        <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-content-primary">타임라인</h2>
                                {isRegenerating && (
                                    <span className="text-xs text-content-muted animate-pulse">요약 재생성 중...</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleRegenerateSummary}
                                    disabled={isRegenerating}
                                    className="text-xs px-2.5 py-1 border border-border rounded-lg text-content-muted hover:text-content-secondary hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    title="현재 포인트 기준으로 AI 요약을 다시 생성합니다"
                                >
                                    {isRegenerating ? '재생성 중...' : '요약 재생성'}
                                </button>
                                <div className="flex items-center gap-1 bg-surface-muted rounded-lg p-0.5">
                                    <button
                                        onClick={() => setTimelineTab('preview')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                            timelineTab === 'preview'
                                                ? 'bg-surface text-content-primary shadow-sm'
                                                : 'text-content-muted hover:text-content-secondary'
                                        }`}
                                    >
                                        유저뷰
                                    </button>
                                    <button
                                        onClick={() => setTimelineTab('manage')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                            timelineTab === 'manage'
                                                ? 'bg-surface text-content-primary shadow-sm'
                                                : 'text-content-muted hover:text-content-secondary'
                                        }`}
                                    >
                                        포인트 관리
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4">
                            {timelineTab === 'preview' ? (
                                <TimelineSection
                                    key={summaryKey}
                                    issueId={issue.id}
                                    issueStatus={issue.status}
                                    issueUpdatedAt={issue.updated_at}
                                />
                            ) : (
                                <TimelineEditor
                                    issueId={issue.id}
                                    issueStatus={issue.status}
                                    issueUpdatedAt={issue.updated_at}
                                    onDeleteSuccess={handleTimelineDeleteSuccess}
                                />
                            )}
                        </div>
                    </div>


                    {/* 출처 */}
                    <SourcesSection key={sourcesKey} issueId={issue.id} />
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
