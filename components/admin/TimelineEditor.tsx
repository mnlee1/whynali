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
}

const STAGES: TimelineStage[] = ['발단', '전개', '파생', '진정']

const STAGE_STYLES: Record<TimelineStage, { badge: string; dot: string; line: string }> = {
    '발단': { badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500',   line: 'bg-blue-200' },
    '전개': { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500',  line: 'bg-green-200' },
    '파생': { badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', line: 'bg-yellow-200' },
    '진정': { badge: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400',   line: 'bg-gray-200' },
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

export default function TimelineEditor({ issueId }: TimelineEditorProps) {
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
                        const isLast = index === points.length - 1

                        return (
                            <div key={point.id} className="flex gap-3">
                                {/* 타임라인 라인 */}
                                <div className="flex flex-col items-center shrink-0">
                                    <div className={`w-2.5 h-2.5 rounded-full mt-3.5 ${style.dot}`} />
                                    {!isLast && (
                                        <div className={`w-0.5 flex-1 mt-1 ${style.line}`} />
                                    )}
                                </div>

                                {/* 카드 */}
                                <div className="flex-1 pb-3">
                                    <div className="flex items-start justify-between gap-2 p-3 border border-border rounded-xl card">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${style.badge}`}>
                                                    {point.stage}
                                                </span>
                                                <span className="text-xs text-content-muted">
                                                    {formatDateTime(point.occurred_at)}
                                                </span>
                                            </div>
                                            {point.title && (
                                                <p className="text-sm text-content-primary font-medium truncate">
                                                    {point.title}
                                                </p>
                                            )}
                                            {point.source_url && (
                                                <a
                                                    href={point.source_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary hover:underline truncate block"
                                                >
                                                    {point.source_url}
                                                </a>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleDelete(point.id)}
                                            disabled={deletingId === point.id}
                                            className="shrink-0 text-xs px-2 py-1 text-red-500 border border-red-200 rounded-full hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {deletingId === point.id ? '삭제중' : '삭제'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 안내 메시지 */}
            <div className="text-xs text-content-muted text-center py-2 border-t border-border-muted">
                타임라인 포인트는 자동 생성 Cron을 통해서만 추가됩니다. (중립성 유지)
            </div>
        </div>
    )
}
