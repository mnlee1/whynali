/**
 * components/issue/TimelineSection.tsx
 * 
 * [이슈 타임라인 섹션]
 * 
 * 이슈의 시간 흐름을 "발단 → 전개 → 파생 → 진정" 순서로 보여주는 컴포넌트입니다.
 * 위에서 아래로 시간순 배치, 각 포인트는 카드 형태로 표시됩니다.
 * 
 * 사용 예시:
 *   <TimelineSection issueId="abc-123" />
 */

'use client'

import { useState, useEffect } from 'react'
import { getTimeline } from '@/lib/api/issues'
import type { TimelinePoint } from '@/types/issue'

interface TimelineSectionProps {
    issueId: string // 타임라인을 가져올 이슈 ID
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

    // 단계별 색상
    const getStageColor = (stage: string): string => {
        switch (stage) {
            case '발단':
                return 'bg-blue-50 border-blue-200 text-blue-700'
            case '전개':
                return 'bg-green-50 border-green-200 text-green-700'
            case '파생':
                return 'bg-yellow-50 border-yellow-200 text-yellow-700'
            case '진정':
                return 'bg-gray-50 border-gray-200 text-gray-700'
            default:
                return 'bg-gray-50 border-gray-200 text-gray-700'
        }
    }

    // 날짜 포맷
    const formatDateTime = (dateString: string): string => {
        const date = new Date(dateString)
        return date.toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (loading) {
        return (
            <div className="py-4 text-center text-gray-500">
                타임라인 로딩 중...
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
            <div className="py-4 text-center text-gray-500">
                타임라인 정보가 없습니다.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {timeline.map((point, index) => (
                <div key={point.id} className="flex gap-4">
                    {/* 타임라인 왼쪽 라인 */}
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        {index < timeline.length - 1 && (
                            <div className="w-0.5 flex-1 bg-gray-300 mt-2"></div>
                        )}
                    </div>

                    {/* 타임라인 카드 */}
                    <div className="flex-1 pb-6">
                        <div className={`p-4 border rounded-lg ${getStageColor(point.stage)}`}>
                            {/* 단계 + 날짜 */}
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold">
                                    {point.stage}
                                </span>
                                <span className="text-xs">
                                    {formatDateTime(point.occurred_at)}
                                </span>
                            </div>

                            {/* 출처 링크 */}
                            <a
                                href={point.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm underline hover:text-blue-600"
                            >
                                출처 보기 →
                            </a>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
