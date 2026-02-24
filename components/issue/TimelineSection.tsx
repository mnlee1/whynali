/**
 * components/issue/TimelineSection.tsx
 *
 * 이슈 타임라인 섹션.
 * 발단 → 전개 → 파생 → 진정 순서로 카드 배치.
 * 각 카드에는 이벤트 요약 텍스트(title)와 출처 링크가 표시됩니다.
 *
 * 사용 예시:
 *   <TimelineSection issueId="abc-123" />
 */

'use client'

import { useState, useEffect } from 'react'
import { getTimeline } from '@/lib/api/issues'
import type { TimelinePoint } from '@/types/issue'

interface TimelineSectionProps {
    issueId: string
}

const STAGE_STYLES: Record<string, { card: string; dot: string; line: string }> = {
    '발단': {
        card: 'bg-blue-50 border-blue-200',
        dot:  'bg-blue-500',
        line: 'bg-blue-200',
    },
    '전개': {
        card: 'bg-green-50 border-green-200',
        dot:  'bg-green-500',
        line: 'bg-green-200',
    },
    '파생': {
        card: 'bg-yellow-50 border-yellow-200',
        dot:  'bg-yellow-500',
        line: 'bg-yellow-200',
    },
    '진정': {
        card: 'bg-gray-50 border-gray-200',
        dot:  'bg-gray-400',
        line: 'bg-gray-200',
    },
}

const STAGE_TEXT_COLOR: Record<string, string> = {
    '발단': 'text-blue-700',
    '전개': 'text-green-700',
    '파생': 'text-yellow-700',
    '진정': 'text-gray-600',
}

function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function TimelineSection({ issueId }: TimelineSectionProps) {
    const [timeline, setTimeline] = useState<TimelinePoint[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchTimeline = async () => {
            try {
                setLoading(true)
                const response = await getTimeline(issueId)
                setTimeline(response.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : '타임라인 조회 실패')
            } finally {
                setLoading(false)
            }
        }
        fetchTimeline()
    }, [issueId])

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-gray-200 animate-pulse" />
                            <div className="w-0.5 flex-1 bg-gray-100 mt-2" />
                        </div>
                        <div className="flex-1 pb-6">
                            <div className="p-4 border border-gray-100 rounded-xl space-y-2">
                                <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                                <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                {error}
            </div>
        )
    }

    if (timeline.length === 0) {
        return (
            <p className="text-sm text-gray-400 text-center py-6">
                타임라인 정보가 없습니다.
            </p>
        )
    }

    return (
        <div className="space-y-0">
            {timeline.map((point, index) => {
                const style = STAGE_STYLES[point.stage] ?? STAGE_STYLES['진정']
                const textColor = STAGE_TEXT_COLOR[point.stage] ?? 'text-gray-600'
                const isLast = index === timeline.length - 1

                return (
                    <div key={point.id} className="flex gap-4">
                        {/* 왼쪽 타임라인 라인 */}
                        <div className="flex flex-col items-center">
                            <div className={`w-3 h-3 rounded-full shrink-0 mt-4 ${style.dot}`} />
                            {!isLast && (
                                <div className={`w-0.5 flex-1 mt-1 ${style.line}`} />
                            )}
                        </div>

                        {/* 카드 */}
                        <div className="flex-1 pb-4">
                            <div className={`p-4 border rounded-xl ${style.card}`}>
                                {/* 단계 + 날짜 */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.card} ${textColor}`}>
                                        {point.stage}
                                    </span>
                                    <span className={`text-xs ${textColor} opacity-80`}>
                                        {formatDateTime(point.occurred_at)}
                                    </span>
                                </div>

                                {/* 이벤트 요약 텍스트 (title 컬럼 있을 때) */}
                                {point.title && (
                                    <p className={`text-sm font-medium mb-2 ${textColor}`}>
                                        {point.title}
                                    </p>
                                )}

                                {/* 출처 링크 */}
                                {point.source_url ? (
                                    <a
                                        href={point.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-xs underline underline-offset-2 hover:opacity-70 transition-opacity ${textColor}`}
                                    >
                                        출처 확인 →
                                    </a>
                                ) : (
                                    <span className="text-xs text-gray-400">출처 없음</span>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
