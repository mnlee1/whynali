/**
 * components/admin/TimelineEditor.tsx
 *
 * 관리자용 타임라인 포인트 편집 컴포넌트.
 * 이슈별 타임라인 포인트를 조회하고, 삭제할 수 있습니다.
 * 추가는 자동 생성만 가능합니다 (중립성 유지, 조작 의혹 방지).
 * IssuePreviewDrawer 내부에서 사용합니다.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TimelinePoint, TimelineStage } from '@/types/issue'

interface TimelineEditorProps {
    issueId: string
    issueStatus?: string       // 이슈 현재 상태 ('종결' 여부 판단용)
    issueUpdatedAt?: string    // 종결 시각 표시용
}


const STAGE_STYLES: Record<TimelineStage, { card: string; dot: string; line: string; header: string; headerText: string; headerLine: string }> = {
    '발단': { card: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-500',   line: 'bg-blue-200',   header: 'bg-blue-500',  headerText: 'text-blue-600',  headerLine: 'bg-blue-100' },
    '전개': { card: 'bg-green-50 border-green-200',  dot: 'bg-green-500',  line: 'bg-green-200',  header: 'bg-green-500', headerText: 'text-green-600', headerLine: 'bg-green-100' },
    '파생': { card: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', line: 'bg-yellow-200', header: 'bg-yellow-500', headerText: 'text-yellow-600', headerLine: 'bg-yellow-100' },
    '진정': { card: 'bg-gray-50 border-gray-200',    dot: 'bg-gray-400',   line: 'bg-gray-200',   header: 'bg-gray-400',  headerText: 'text-gray-500',  headerLine: 'bg-gray-100' },
}

const STAGE_TEXT_COLOR: Record<TimelineStage, string> = {
    '발단': 'text-blue-700',
    '전개': 'text-green-700',
    '파생': 'text-yellow-700',
    '진정': 'text-gray-600',
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function TimelineEditor({ issueId, issueStatus, issueUpdatedAt }: TimelineEditorProps) {
    const [points, setPoints] = useState<TimelinePoint[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchPoints = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await fetch(`/api/issues/${issueId}/timeline`)
            if (!res.ok) throw new Error('타임라인 조회 실패')
            const json = await res.json()
            setPoints(json.data ?? [])
        } catch (err) {
            setError(err instanceof Error ? err.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [issueId])

    useEffect(() => {
        fetchPoints()
    }, [fetchPoints])

    const handleDelete = async (pointId: string) => {
        if (!confirm('이 타임라인 포인트를 삭제하시겠습니까?')) return
        try {
            setDeletingId(pointId)
            setError(null)
            const res = await fetch(`/api/issues/${issueId}/timeline/${pointId}`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error('삭제 실패')
            await fetchPoints()
        } catch (err) {
            setError(err instanceof Error ? err.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="space-y-4">
            {/* 에러 메시지 */}
            {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 포인트 목록 */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="h-14 bg-surface-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : points.length === 0 ? (
                <div className="text-sm text-content-muted text-center py-6 space-y-1">
                    <p>등록된 타임라인 포인트가 없습니다.</p>
                    <p className="text-xs">타임라인은 자동 생성 Cron을 통해서만 추가됩니다.</p>
                </div>
            ) : (
                <div className="space-y-0">
                    {points.map((point, index) => {
                        const style = STAGE_STYLES[point.stage as TimelineStage] ?? STAGE_STYLES['진정']
                        const textColor = STAGE_TEXT_COLOR[point.stage as TimelineStage] ?? 'text-content-secondary'
                        const isLastPoint = index === points.length - 1
                        const isClosed = issueStatus === '종결'
                        // 종결 블록이 뒤에 붙으면 마지막 포인트 세로선도 이어져야 함
                        const isLast = isLastPoint && !isClosed
                        const prevStage = index > 0 ? points[index - 1].stage : null
                        const isNewStage = point.stage !== prevStage

                        return (
                            <div key={point.id}>
                                {/* 단계 헤더 — stage가 바뀌는 시점에만 표시 */}
                                {isNewStage && (
                                    <div className={`flex items-center gap-2 mb-3 ${index > 0 ? 'mt-5' : ''}`}>
                                        <div className={`w-[3px] h-[0.8rem] rounded-full shrink-0 ${style.header}`} />
                                        <span className={`text-sm font-semibold ${style.headerText}`}>
                                            {point.stage}
                                        </span>
                                        <div className={`flex-1 h-px ${style.headerLine}`} />
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    {/* 왼쪽 dot + 세로선 */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-3.5 ${style.dot}`} />
                                        {!isLast && (
                                            <div className={`w-px flex-1 mt-1 ${style.line}`} />
                                        )}
                                    </div>

                                    {/* 카드 */}
                                    <div className="flex-1 pb-3">
                                        <div className={`p-3 border rounded-xl ${style.card}`}>
                                            {/* 날짜 */}
                                            <span className={`text-xs ${textColor} opacity-70 block mb-1`}>
                                                {formatDateTime(point.occurred_at)}
                                            </span>

                                            {/* 이벤트 요약 텍스트 */}
                                            {point.title && (
                                                <p className={`text-sm font-medium mb-2 leading-snug ${textColor}`}>
                                                    {point.title}
                                                </p>
                                            )}

                                            {/* 출처 + 삭제 버튼 */}
                                            <div className="flex items-center justify-between gap-2">
                                                {point.source_url ? (
                                                    <a
                                                        href={point.source_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity ${textColor}`}
                                                    >
                                                        <span>출처</span>
                                                        <span className="opacity-60">
                                                            ({new URL(point.source_url).hostname.replace('www.', '')})
                                                        </span>
                                                        <span>→</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-content-muted">출처 없음</span>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(point.id)}
                                                    disabled={deletingId === point.id}
                                                    className="shrink-0 text-xs px-2 py-0.5 text-red-500 border border-red-200 rounded-full hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    {deletingId === point.id ? '삭제중' : '삭제'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {/* 종결 블록 — issueStatus가 '종결'일 때만 표시 */}
                    {issueStatus === '종결' && (
                        <div className="flex gap-3 mt-2">
                            <div className="flex flex-col items-center">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-3.5 bg-gray-400" />
                            </div>
                            <div className="flex-1 pb-3">
                                <div className="p-3 border border-gray-200 rounded-xl bg-gray-50">
                                    <span className="text-xs text-gray-400 block mb-1">
                                        {issueUpdatedAt ? formatDateTime(issueUpdatedAt) : ''}
                                    </span>
                                    <p className="text-sm font-medium text-gray-500">이슈 종결</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 안내 메시지 */}
            <div className="text-sm text-content-muted text-center py-2 border-t border-border-muted">
                타임라인 포인트는 자동 생성 Cron을 통해서만 추가됩니다. (중립성 유지)
            </div>
        </div>
    )
}
