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
import { formatDateWithTime } from '@/lib/utils/format-date'
import type { TimelinePoint } from '@/types/issue'

interface TimelineSectionProps {
    issueId: string
}

const STAGE_STYLES: Record<string, { card: string; dot: string; line: string; badge: string; header: string; headerText: string; headerLine: string }> = {
    '발단': {
        card: 'bg-blue-50 border-blue-200',
        dot:  'bg-blue-500',
        line: 'bg-blue-200',
        badge: 'bg-blue-500 text-white',
        header: 'bg-blue-500',
        headerText: 'text-blue-600',
        headerLine: 'bg-blue-100',
    },
    '전개': {
        card: 'bg-green-50 border-green-200',
        dot:  'bg-green-500',
        line: 'bg-green-200',
        badge: 'bg-green-500 text-white',
        header: 'bg-green-500',
        headerText: 'text-green-600',
        headerLine: 'bg-green-100',
    },
    '파생': {
        card: 'bg-yellow-50 border-yellow-200',
        dot:  'bg-yellow-500',
        line: 'bg-yellow-200',
        badge: 'bg-yellow-500 text-white',
        header: 'bg-yellow-500',
        headerText: 'text-yellow-600',
        headerLine: 'bg-yellow-100',
    },
    '진정': {
        card: 'bg-gray-50 border-gray-200',
        dot:  'bg-gray-400',
        line: 'bg-gray-200',
        badge: 'bg-gray-500 text-white',
        header: 'bg-gray-400',
        headerText: 'text-gray-500',
        headerLine: 'bg-gray-100',
    },
}

const STAGE_TEXT_COLOR: Record<string, string> = {
    '발단': 'text-blue-700',
    '전개': 'text-green-700',
    '파생': 'text-yellow-700',
    '진정': 'text-gray-600',
}

export default function TimelineSection({ issueId }: TimelineSectionProps) {
    const [timeline, setTimeline] = useState<TimelinePoint[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchTimeline = async () => {
            try {
                setLoading(true)
                console.log('[TimelineSection] Fetching timeline for issue:', issueId)
                const response = await getTimeline(issueId)
                console.log('[TimelineSection] Timeline response:', response)
                console.log('[TimelineSection] Timeline data count:', response.data?.length ?? 0)
                setTimeline(response.data)
            } catch (err) {
                console.error('[TimelineSection] Error fetching timeline:', err)
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
                            <div className="w-3 h-3 rounded-full bg-border animate-pulse" />
                            <div className="w-0.5 flex-1 bg-border-muted mt-2" />
                        </div>
                        <div className="flex-1 pb-6">
                            <div className="p-4 border border-border-muted rounded-xl space-y-2">
                                <div className="h-3 w-16 bg-border-muted rounded-full animate-pulse" />
                                <div className="h-4 w-3/4 bg-border-muted rounded-full animate-pulse" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                {error}
            </div>
        )
    }

    if (timeline.length === 0) {
        return (
            <div className="text-center py-8 space-y-3">
                <div className="text-4xl">⏳</div>
                <p className="text-sm font-medium text-content-secondary">
                    타임라인을 생성 중입니다
                </p>
                <p className="text-xs text-content-muted">
                    뉴스가 수집되면 자동으로 타임라인이 생성됩니다
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-0">
            {timeline.map((point, index) => {
                const style = STAGE_STYLES[point.stage] ?? STAGE_STYLES['진정']
                const textColor = STAGE_TEXT_COLOR[point.stage] ?? 'text-content-secondary'
                const isLast = index === timeline.length - 1
                const prevStage = index > 0 ? timeline[index - 1].stage : null
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
                                        {formatDateWithTime(point.occurred_at)}
                                    </span>

                                    {/* 이벤트 요약 텍스트 */}
                                    {point.title && (
                                        <p className={`text-sm font-medium mb-2 leading-snug ${textColor}`}>
                                            {point.title}
                                        </p>
                                    )}

                                    {/* 출처 링크 */}
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
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
