'use client'

import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { formatTimelineDate } from '@/lib/utils/format-date'

interface TimelinePoint {
    id: string
    stage: '발단' | '전개' | '파생' | '진정'
    title: string
    ai_summary: string | null
    source_url: string
    occurred_at: string
}

interface TimelineSectionProps {
    issueId: string
    issueStatus?: string
    issueUpdatedAt?: string
}

const STAGE_STYLES = {
    '발단': {
        dot: 'bg-blue-500',
        line: 'bg-blue-200',
        header: 'bg-blue-500',
        headerText: 'text-blue-600',
        headerLine: 'bg-blue-100',
        card: 'bg-blue-50 border-blue-200',
    },
    '전개': {
        dot: 'bg-green-500',
        line: 'bg-green-200',
        header: 'bg-green-500',
        headerText: 'text-green-600',
        headerLine: 'bg-green-100',
        card: 'bg-green-50 border-green-200',
    },
    '파생': {
        dot: 'bg-yellow-500',
        line: 'bg-yellow-200',
        header: 'bg-yellow-500',
        headerText: 'text-yellow-600',
        headerLine: 'bg-yellow-100',
        card: 'bg-yellow-50 border-yellow-200',
    },
    '진정': {
        dot: 'bg-gray-400',
        line: 'bg-gray-200',
        header: 'bg-gray-400',
        headerText: 'text-gray-500',
        headerLine: 'bg-gray-100',
        card: 'bg-gray-50 border-gray-200',
    },
}

export default function TimelineSection({ issueId, issueStatus, issueUpdatedAt }: TimelineSectionProps) {
    const [points, setPoints] = useState<TimelinePoint[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({})

    const toggleStage = (stage: string) => {
        setExpandedStages(prev => ({
            ...prev,
            [stage]: !prev[stage]
        }))
    }

    useEffect(() => {
        const fetchTimeline = async () => {
            try {
                setLoading(true)
                const res = await fetch(`/api/issues/${issueId}/timeline`)
                if (!res.ok) throw new Error('타임라인 조회 실패')
                const json = await res.json()
                setPoints(json.data ?? [])
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
                            <div className="w-3 h-3 rounded-full bg-border animate-pulse" />
                            <div className="w-0.5 flex-1 bg-border-muted mt-2" />
                        </div>
                        <div className="flex-1 pb-6">
                            <div className="p-4 border border-border-muted rounded-xl space-y-2">
                                <div className="h-3 w-16 bg-border-muted rounded-full animate-pulse" />
                                <div className="h-4 w-3/4 bg-border-muted rounded-full animate-pulse" />
                                <div className="h-3 w-full bg-border-muted rounded-full animate-pulse" />
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

    if (points.length === 0) {
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

    const isClosed = issueStatus === '종결'
    
    const groupedByStage = points.reduce((acc, point) => {
        if (!acc[point.stage]) {
            acc[point.stage] = []
        }
        acc[point.stage].push(point)
        return acc
    }, {} as Record<string, TimelinePoint[]>)

    const stageOrder: Array<'발단' | '전개' | '파생' | '진정'> = ['발단', '전개', '파생', '진정']
    const stages = stageOrder.filter(stage => groupedByStage[stage])

    return (
        <div className="space-y-0">
            {/* AI 안내 문구 */}
            <div className="mb-4 flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <Bot className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600 leading-relaxed">
                    AI가 자동 생성한 타임라인으로, 실제 내용과 다를 수 있습니다.
                </p>
            </div>

            {stages.map((stage, index) => {
                const stagePoints = groupedByStage[stage]
                const style = STAGE_STYLES[stage] ?? STAGE_STYLES['진정']
                const isLast = index === stages.length - 1 && !isClosed

                const INITIAL_SHOW_COUNT = 3
                const expanded = expandedStages[stage] || false
                const hasMore = stagePoints.length > INITIAL_SHOW_COUNT
                
                // 최신 3개만 표시 (배열은 오름차순이므로 slice(-3)로 마지막 3개)
                const visiblePoints = expanded ? stagePoints : stagePoints.slice(-INITIAL_SHOW_COUNT)
                const hiddenCount = stagePoints.length - INITIAL_SHOW_COUNT

                return (
                    <div key={stage}>
                        {/* 단계 헤더 */}
                        <div className={`flex items-center gap-2 mb-3 ${index > 0 ? 'mt-5' : ''}`}>
                            <div className={`w-[3px] h-[0.8rem] rounded-full shrink-0 ${style.header}`} />
                            <span className={`text-sm font-semibold ${style.headerText}`}>
                                {stage}
                            </span>
                            <div className={`flex-1 h-px ${style.headerLine}`} />
                        </div>

                        <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-3.5 ${style.dot}`} />
                                {!isLast && (
                                    <div className={`w-px flex-1 mt-1 ${style.line}`} />
                                )}
                            </div>

                            <div className="flex-1 pb-3">
                                <div className={`p-3 border rounded-xl ${style.card}`}>
                                    {hasMore && (
                                        <button
                                            onClick={() => toggleStage(stage)}
                                            className="mb-3 w-full btn-neutral btn-sm text-xs"
                                        >
                                            {expanded ? '접기' : `이전 상황 더보기 (${hiddenCount}개)`}
                                        </button>
                                    )}
                                    
                                    <ul className="space-y-3">
                                        {visiblePoints.map((point) => {
                                            const displayText = point.ai_summary || point.title
                                            const [title, ...descParts] = displayText.split(':')
                                            const description = descParts.join(':').trim()
                                            
                                            return (
                                                <li key={point.id} className="text-sm leading-relaxed">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className={`font-semibold ${style.headerText}`}>
                                                                {title}
                                                            </span>
                                                            <span className="text-content-muted text-xs">
                                                                {formatTimelineDate(point.occurred_at)}
                                                            </span>
                                                        </div>
                                                        {description && (
                                                            <p className="text-content-secondary pl-0">
                                                                {description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}

            {/* 종결 */}
            {isClosed && (
                <div>
                    <div className="flex items-center gap-2 mb-3 mt-5">
                        <div className="w-[3px] h-[0.8rem] rounded-full shrink-0 bg-gray-400" />
                        <span className="text-sm font-semibold text-gray-500">종결</span>
                        <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-3.5 bg-gray-400" />
                        </div>
                        <div className="flex-1 pb-3">
                            <div className="p-3 border border-gray-200 rounded-xl bg-gray-50">
                                {issueUpdatedAt && (
                                    <span className="text-xs text-gray-400 block mb-1">
                                        {formatTimelineDate(issueUpdatedAt)}
                                    </span>
                                )}
                                <p className="text-sm font-medium text-gray-500">이슈 종결</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
