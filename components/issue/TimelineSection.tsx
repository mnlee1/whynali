'use client'

/**
 * components/issue/TimelineSection.tsx
 *
 * [이슈 타임라인 컴포넌트]
 *
 * 이슈의 진행 단계(발단→전개→파생→진정→종결)를 카드 형태로 시각화합니다.
 * 우선순위: initialPoints(날짜+내용) > initialSummaries.bullets(AI 요약 fallback)
 * - points가 있으면 각 포인트를 날짜와 함께 카드 안에 표시
 * - points가 없는 단계는 summaries의 bullets로 fallback
 */

import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'

type TimelineStage = '발단' | '전개' | '파생' | '진정' | '종결'

interface StageSummary {
    stage: TimelineStage
    stageTitle: string
    bullets: Array<string | { date: string; text: string }>
    dateStart: string
    dateEnd: string
}

interface TimelineSectionProps {
    issueId: string
    issueStatus?: string
    initialSummaries?: StageSummary[]
}

/** "M월 D일" 형식 포맷은 generate-timeline-summary.ts에서 생성 시 포함되므로 UI에서 별도 변환 불필요 */

const STAGE_STYLES: Record<TimelineStage, {
    dot: string
    line: string
    header: string
    headerText: string
    headerLine: string
    card: string
    dateBadge: string
    bullet: string
}> = {
    '발단': {
        dot: 'bg-blue-500',
        line: 'bg-blue-200',
        header: 'bg-blue-500',
        headerText: 'text-blue-600',
        headerLine: 'bg-blue-100',
        card: 'bg-blue-50 border-blue-200',
        dateBadge: 'text-blue-500',
        bullet: 'bg-blue-300',
    },
    '전개': {
        dot: 'bg-green-500',
        line: 'bg-green-200',
        header: 'bg-green-500',
        headerText: 'text-green-600',
        headerLine: 'bg-green-100',
        card: 'bg-green-50 border-green-200',
        dateBadge: 'text-green-500',
        bullet: 'bg-green-300',
    },
    '파생': {
        dot: 'bg-yellow-500',
        line: 'bg-yellow-200',
        header: 'bg-yellow-500',
        headerText: 'text-yellow-600',
        headerLine: 'bg-yellow-100',
        card: 'bg-yellow-50 border-yellow-200',
        dateBadge: 'text-yellow-500',
        bullet: 'bg-yellow-300',
    },
    '진정': {
        dot: 'bg-gray-400',
        line: 'bg-gray-200',
        header: 'bg-gray-400',
        headerText: 'text-gray-500',
        headerLine: 'bg-gray-100',
        card: 'bg-gray-50 border-gray-200',
        dateBadge: 'text-gray-400',
        bullet: 'bg-gray-300',
    },
    '종결': {
        dot: 'bg-gray-400',
        line: 'bg-gray-200',
        header: 'bg-gray-400',
        headerText: 'text-gray-500',
        headerLine: 'bg-gray-100',
        card: 'bg-gray-50 border-gray-200',
        dateBadge: 'text-gray-400',
        bullet: 'bg-gray-300',
    },
}

export default function TimelineSection({
    issueId,
    issueStatus,
    initialSummaries,
}: TimelineSectionProps) {
    const [summaries, setSummaries] = useState<StageSummary[]>(initialSummaries ?? [])
    const [loading, setLoading] = useState(!initialSummaries)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (initialSummaries) return
        const fetchSummaries = async () => {
            try {
                setLoading(true)
                const res = await fetch(`/api/issues/${issueId}/timeline/summary`)
                if (!res.ok) throw new Error('타임라인 조회 실패')
                const json = await res.json()
                setSummaries(json.data ?? [])
            } catch (err) {
                setError(err instanceof Error ? err.message : '타임라인 조회 실패')
            } finally {
                setLoading(false)
            }
        }
        fetchSummaries()
    }, [issueId, initialSummaries])

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

    if (summaries.length === 0) {
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
    const stageOrder: TimelineStage[] = ['발단', '전개', '파생', '진정', '종결']

    // summaries 기준으로 단계 목록 구성, 종결은 isClosed일 때만 포함
    const stages = stageOrder.filter(s => {
        if (s === '종결') return isClosed
        return summaries.find(sum => sum.stage === s)
    })

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
                const summary = summaries.find(s => s.stage === stage)
                const style = STAGE_STYLES[stage]
                const isLast = index === stages.length - 1

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
                                    {/* 단계 타이틀 */}
                                    {summary?.stageTitle && (
                                        <p className={`text-sm font-semibold mb-2 ${style.headerText}`}>
                                            {summary.stageTitle}
                                        </p>
                                    )}

                                    {/* bullets 렌더링: {date, text} 형식(새 데이터) 또는 string(구 데이터) 모두 처리 */}
                                    {summary && summary.bullets.length > 0 ? (
                                        <ul className="space-y-2">
                                            {summary.bullets.map((bullet, i) => {
                                                const isObj = typeof bullet === 'object' && bullet !== null
                                                const text = isObj ? (bullet as { date: string; text: string }).text : bullet as string
                                                const date = isObj ? (bullet as { date: string; text: string }).date : ''
                                                return (
                                                    <li key={i} className="flex items-start gap-2.5">
                                                        {date ? (
                                                            <span className={`text-xs font-medium shrink-0 mt-0.5 w-14 ${style.dateBadge}`}>
                                                                {date}
                                                            </span>
                                                        ) : (
                                                            <span className={`w-1 h-1 rounded-full shrink-0 mt-2 ${style.bullet}`} />
                                                        )}
                                                        <span className="text-sm text-content-secondary leading-relaxed">
                                                            {text}
                                                        </span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    ) : stage === '종결' ? (
                                        <p className="text-sm font-medium text-gray-500">이슈 종결</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}

        </div>
    )
}
