/**
 * components/admin/TimelineEditor.tsx
 *
 * 관리자용 타임라인 포인트 편집 컴포넌트.
 * 이슈별 타임라인 포인트를 조회하고, 추가·삭제할 수 있습니다.
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

interface AddForm {
    stage: TimelineStage
    occurred_at: string
    title: string
    source_url: string
}

const DEFAULT_FORM: AddForm = {
    stage: '발단',
    occurred_at: '',
    title: '',
    source_url: '',
}

function toLocalDatetimeValue(date: Date): string {
    // datetime-local input은 "YYYY-MM-DDTHH:mm" 형식 필요
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function TimelineEditor({ issueId }: TimelineEditorProps) {
    const [points, setPoints] = useState<TimelinePoint[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState<AddForm>({ ...DEFAULT_FORM, occurred_at: toLocalDatetimeValue(new Date()) })

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

    const handleAdd = async () => {
        if (!form.occurred_at) {
            setError('날짜/시간을 입력해주세요.')
            return
        }
        try {
            setSubmitting(true)
            setError(null)
            const res = await fetch(`/api/issues/${issueId}/timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stage: form.stage,
                    occurred_at: new Date(form.occurred_at).toISOString(),
                    title: form.title.trim() || null,
                    source_url: form.source_url.trim() || null,
                }),
            })
            if (!res.ok) {
                const json = await res.json()
                throw new Error(json.message ?? '추가 실패')
            }
            setForm({ ...DEFAULT_FORM, occurred_at: toLocalDatetimeValue(new Date()) })
            setShowForm(false)
            await fetchPoints()
        } catch (err) {
            setError(err instanceof Error ? err.message : '추가 실패')
        } finally {
            setSubmitting(false)
        }
    }

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
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 포인트 목록 */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : points.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                    등록된 타임라인 포인트가 없습니다.
                </p>
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
                                    <div className="flex items-start justify-between gap-2 p-3 border border-gray-200 rounded-xl bg-white">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${style.badge}`}>
                                                    {point.stage}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {formatDateTime(point.occurred_at)}
                                                </span>
                                            </div>
                                            {point.title && (
                                                <p className="text-sm text-gray-700 font-medium truncate">
                                                    {point.title}
                                                </p>
                                            )}
                                            {point.source_url && (
                                                <a
                                                    href={point.source_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-500 hover:underline truncate block"
                                                >
                                                    {point.source_url}
                                                </a>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleDelete(point.id)}
                                            disabled={deletingId === point.id}
                                            className="shrink-0 text-xs px-2 py-1 text-red-500 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
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

            {/* 추가 폼 토글 */}
            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full py-2 text-sm border border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                    + 포인트 추가
                </button>
            ) : (
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">새 타임라인 포인트</p>

                    {/* 단계 선택 */}
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">단계</label>
                        <div className="flex gap-2 flex-wrap">
                            {STAGES.map((stage) => (
                                <button
                                    key={stage}
                                    onClick={() => setForm((f) => ({ ...f, stage }))}
                                    className={[
                                        'text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
                                        form.stage === stage
                                            ? STAGE_STYLES[stage].badge + ' border-current'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
                                    ].join(' ')}
                                >
                                    {stage}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 날짜/시간 */}
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">발생 날짜/시간 <span className="text-red-500">*</span></label>
                        <input
                            type="datetime-local"
                            value={form.occurred_at}
                            onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                        />
                    </div>

                    {/* 제목 */}
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">이벤트 요약 (선택)</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder="한 줄 요약"
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                        />
                    </div>

                    {/* 출처 URL */}
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">출처 URL (선택)</label>
                        <input
                            type="url"
                            value={form.source_url}
                            onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                            placeholder="https://"
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                        />
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            disabled={submitting}
                            className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {submitting ? '추가 중...' : '추가'}
                        </button>
                        <button
                            onClick={() => { setShowForm(false); setError(null) }}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
