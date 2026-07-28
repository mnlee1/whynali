'use client'

/**
 * components/issue/TimelineSection.tsx
 *
 * [이슈 타임라인 컴포넌트]
 *
 * 정렬 모드 2종 (세그먼트 컨트롤로 전환, 로그인 사용자만 노출):
 * - latest(최신순): 최근 3건 기본 노출, 펼치면 더 과거 기록이 아래로 이어짐
 * - oldest(시간순): 발단(가장 오래된) 3건 기본 노출, 펼치면 더 최근 기록이 아래로 이어짐
 *
 * 비로그인 사용자는 정렬 토글이 보이지 않고 항상 latest(최근 3건) 고정 — 모드를 오가며
 * 서로 다른 3건씩(최근+발단)을 조합해 로그인 없이 우회 열람하는 것을 막기 위함.
 *
 * 우선순위: initialSummaries(AI 요약 bullets) > timeline_points(원본, fallback)
 */

import { useState, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react'
import { Bot, Clock, ChevronDown, ChevronUp, BarChart3, ChevronRight } from 'lucide-react'
import { formatKstDateHeader, formatKstTime, formatKstDateKey, parseKoreanMonthDayTime } from '@/lib/utils/format-date'
import { goToLogin } from '@/lib/pendingAction'

type TimelineStage = '발단' | '전개' | '파생' | '진정' | '종결'
type SortMode = 'latest' | 'oldest'

interface StageSummary {
    stage: TimelineStage
    stageTitle: string
    bullets: Array<string | { date: string; text: string; linkedVoteId?: string }>
    dateStart: string
    dateEnd: string
}

interface TimelineSectionProps {
    issueId: string
    issueStatus?: string
    initialSummaries?: StageSummary[]
    timelineReadingMinutes?: number
    userId?: string | null
}

interface FlatItem {
    key: string
    stage: TimelineStage
    text: string
    sortDate: Date
    timeLabel: string | null
    linkedVoteId?: string
}

const VISIBLE_COUNT = 3
const STAGE_ORDER: TimelineStage[] = ['발단', '전개', '파생', '진정', '종결']
const SORT_LABEL: Record<SortMode, string> = { latest: '최신순', oldest: '시간순' }
const SORT_MODES: SortMode[] = ['latest', 'oldest']
const PEEK_BLUR_STEPS = [
    { blur: 'blur-[1.5px]', opacity: 'opacity-70' },
    { blur: 'blur-[4px]', opacity: 'opacity-45' },
]

/** dateLabel이 실제 ISO 타임스탬프(원본 포인트 fallback)인지, AI가 만든 "7월 19일 14:00" 형식인지 판별해서 Date로 복원 */
function resolveDate(dateLabel: string, fallbackYearFrom: string): { date: Date; timeLabel: string | null } | null {
    if (!dateLabel) return null

    if (/^\d{4}-\d{2}-\d{2}/.test(dateLabel)) {
        const direct = new Date(dateLabel)
        if (!isNaN(direct.getTime())) {
            return { date: direct, timeLabel: formatKstTime(dateLabel) }
        }
    }

    const parsed = parseKoreanMonthDayTime(dateLabel, fallbackYearFrom)
    if (parsed) {
        const hasTime = /\d{1,2}:\d{2}/.test(dateLabel)
        return { date: parsed, timeLabel: hasTime ? formatKstTime(parsed.toISOString()) : null }
    }

    return null
}

/**
 * bullet 텍스트의 "**핵심 주어**" 마크업을 파싱해서 그 부분만 볼드로 렌더링한다.
 * 마크업이 없는 구버전 텍스트는 문장 전체를 볼드로 렌더링(기존 동작 유지).
 */
function renderBulletText(text: string): ReactNode {
    if (!text.includes('**')) {
        return <span className="font-semibold">{text}</span>
    }

    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return parts.map((part, i) => {
        const match = part.match(/^\*\*([^*]+)\*\*$/)
        return match
            ? <strong key={i} className="font-semibold text-content-primary">{match[1]}</strong>
            : <span key={i} className="font-normal text-content-secondary">{part}</span>
    })
}

function VoteNudge({ vote, className = '' }: { vote: { title: string; totalCount: number }; className?: string }) {
    return (
        <button
            onClick={() => {
                const el = document.getElementById('section-vote')
                if (!el) return
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                el.classList.add('ring-2', 'ring-[#7b3aed]', 'ring-offset-4', 'rounded-2xl', 'transition-shadow')
                setTimeout(() => {
                    el.classList.remove('ring-2', 'ring-[#7b3aed]', 'ring-offset-4')
                }, 1500)
            }}
            className={`flex items-center gap-1.5 text-[13px] hover:opacity-80 transition-opacity ${className}`}
        >
            <BarChart3 className="w-4 h-4 shrink-0 text-[#16a34a]" />
            <span className="truncate text-content-secondary">
                &quot;{vote.title}&quot; 지금{' '}
                <span className="text-[#16a34a] font-bold">{vote.totalCount}명</span>이{' '}
                <span className="text-[#16a34a]">투표하고 있어요</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 text-[#16a34a]" />
        </button>
    )
}

function buildFlatItems(summaries: StageSummary[]): FlatItem[] {
    const items: FlatItem[] = []
    let idx = 0

    for (const summary of summaries) {
        const fallbackYearFrom = summary.dateStart || summary.dateEnd || new Date().toISOString()

        if (summary.bullets.length === 0) {
            if (summary.stage === '종결') {
                const fallback = summary.dateEnd || summary.dateStart || new Date().toISOString()
                items.push({
                    key: `close-${idx++}`,
                    stage: '종결',
                    text: '이슈가 종결되었습니다',
                    sortDate: new Date(fallback),
                    timeLabel: null,
                })
            }
            continue
        }

        for (const bullet of summary.bullets) {
            const isObj = typeof bullet === 'object' && bullet !== null
            const text = isObj ? (bullet as { text: string }).text : (bullet as string)
            const dateLabel = isObj ? (bullet as { date: string }).date ?? '' : ''
            const linkedVoteId = isObj ? (bullet as { linkedVoteId?: string }).linkedVoteId : undefined
            if (!text) continue

            const resolved = resolveDate(dateLabel, fallbackYearFrom)
            const sortDate = resolved?.date ?? new Date(summary.dateEnd || summary.dateStart || Date.now())

            items.push({
                key: `${summary.stage}-${idx++}`,
                stage: summary.stage,
                text,
                sortDate,
                timeLabel: resolved?.timeLabel ?? null,
                linkedVoteId,
            })
        }
    }

    return items
}

export default function TimelineSection({
    issueId,
    issueStatus,
    initialSummaries,
    timelineReadingMinutes,
    userId,
}: TimelineSectionProps) {
    const [summaries, setSummaries] = useState<StageSummary[]>(initialSummaries ?? [])
    const [loading, setLoading] = useState(!initialSummaries)
    const [error, setError] = useState<string | null>(null)
    const [sortMode, setSortMode] = useState<SortMode>('latest')
    const [showAll, setShowAll] = useState(false)
    const [activeVotes, setActiveVotes] = useState<Record<string, { title: string; totalCount: number }>>({})

    useEffect(() => {
        fetch(`/api/votes?issue_id=${issueId}`)
            .then(res => res.ok ? res.json() : null)
            .then(json => {
                const votes: Array<{ id: string; title?: string; phase?: string; vote_choices?: Array<{ count: number }> }> = json?.data ?? []
                const map: Record<string, { title: string; totalCount: number }> = {}
                for (const v of votes) {
                    if (v.phase === '진행중' && v.title) {
                        map[v.id] = {
                            title: v.title,
                            totalCount: (v.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0),
                        }
                    }
                }
                setActiveVotes(map)
            })
            .catch(() => {})
    }, [issueId])

    useEffect(() => {
        if (initialSummaries) return
        const fetchSummaries = async () => {
            try {
                setLoading(true)
                const res = await fetch(`/api/issues/${issueId}/timeline/summary`)
                if (!res.ok) throw new Error('타임라인 조회 실패')
                const json = await res.json()
                const summaryData: StageSummary[] = json.data ?? []

                if (summaryData.length > 0) {
                    setSummaries(summaryData)
                    return
                }

                const pointsRes = await fetch(`/api/issues/${issueId}/timeline/points`)
                if (!pointsRes.ok) return
                const pointsJson = await pointsRes.json()
                const points: Array<{ stage: TimelineStage; text: string; occurred_at: string }> = pointsJson.data ?? []
                if (points.length === 0) return

                const grouped = new Map<TimelineStage, Array<{ date: string; text: string }>>()
                for (const p of points) {
                    if (!grouped.has(p.stage)) grouped.set(p.stage, [])
                    grouped.get(p.stage)!.push({ date: p.occurred_at, text: p.text })
                }
                const converted: StageSummary[] = STAGE_ORDER
                    .filter(s => grouped.has(s))
                    .map(stage => {
                        const items = grouped.get(stage)!
                        const dates = items.map(i => i.date).filter(Boolean).sort()
                        return {
                            stage,
                            stageTitle: '',
                            bullets: items,
                            dateStart: dates[0] ?? '',
                            dateEnd: dates[dates.length - 1] ?? '',
                        }
                    })
                setSummaries(converted)
            } catch (err) {
                setError(err instanceof Error ? err.message : '타임라인 조회 실패')
            } finally {
                setLoading(false)
            }
        }
        fetchSummaries()
    }, [issueId, initialSummaries])

    const isClosed = issueStatus === '종결'
    const relevantSummaries = useMemo(
        () => summaries.filter(s => (s.stage === '종결' ? isClosed : true)),
        [summaries, isClosed]
    )

    // 항상 오름차순(과거→최근) 기준 데이터
    const chronologicalAsc = useMemo(() => {
        const flat = buildFlatItems(relevantSummaries)
        return flat.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
    }, [relevantSummaries])

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 py-2">
                        <div className="w-12 h-4 bg-border-muted rounded-full animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-3/4 bg-border-muted rounded-full animate-pulse" />
                            <div className="h-3 w-1/2 bg-border-muted rounded-full animate-pulse" />
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

    if (chronologicalAsc.length === 0) {
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

    // 현재 모드 기준 전체 표시 순서 (위→아래) — latest는 최근부터 역순, oldest는 발단부터 정순
    const orderedForMode: FlatItem[] = sortMode === 'latest'
        ? [...chronologicalAsc].reverse()
        : chronologicalAsc

    // 두 모드 모두 "표시 순서상 맨 앞 N건"이 기본 노출, 나머지는 같은 방향으로 이어서 펼쳐짐
    const visibleCount = Math.min(VISIBLE_COUNT, orderedForMode.length)
    const alwaysVisible = orderedForMode.slice(0, visibleCount)
    const collapsible = orderedForMode.slice(visibleCount)

    const displayList = [...alwaysVisible, ...(showAll ? collapsible : [])]
    const collapsedLabel = sortMode === 'latest' ? '이전' : '이후'

    let lastDateKey: string | null = null

    const rows: ReactNode[] = displayList.map((item, index) => {
        const dateKey = formatKstDateKey(item.sortDate.toISOString())
        const showDateHeader = dateKey !== lastDateKey
        lastDateKey = dateKey
        const isLastItem = index === displayList.length - 1 && (showAll || collapsible.length === 0)
        const isFirstItem = index === 0
        const isSideIssue = item.stage === '파생'
        const dotColor = isSideIssue ? 'bg-[#f97317]' : 'bg-[#7b3aed]'
        const linkedVote = item.linkedVoteId ? activeVotes[item.linkedVoteId] : undefined
        const DOT_CENTER = 12 // px: dot top offset(8px) + dot radius(4px)
        const showItemLine = !(isFirstItem && isLastItem)
        const itemLineStyle: CSSProperties = isFirstItem
            ? { top: DOT_CENTER, bottom: 0 }
            : isLastItem
                ? { top: 0, height: DOT_CENTER }
                : { top: 0, bottom: 0 }

        return (
            <div key={item.key}>
                {showDateHeader && (
                    <div className="flex gap-3">
                        <div className="w-2 shrink-0 relative">
                            {index !== 0 && <div className="absolute left-[3px] inset-y-0 w-0.5 bg-border-muted" />}
                        </div>
                        <div className={`text-sm font-bold text-content-secondary pb-2 ${index === 0 ? 'pt-0' : 'pt-4'}`}>
                            {formatKstDateHeader(item.sortDate.toISOString())}
                        </div>
                    </div>
                )}
                <div className="flex gap-3">
                    <div className="w-2 shrink-0 relative">
                        {showItemLine && <div className="absolute left-[3px] w-0.5 bg-border-muted" style={itemLineStyle} />}
                        <div className={`absolute top-2 left-0 w-2 h-2 rounded-full ${dotColor}`} />
                    </div>
                    <div className="flex-1 min-w-0 pb-5">
                        {isSideIssue ? (
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 sm:items-start">
                                <span className="sm:w-11 sm:shrink-0 sm:pt-0.5 text-[13px] font-medium text-content-muted">
                                    {item.timeLabel ?? '–'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-[#fef1e6] text-[#f97317] whitespace-nowrap">
                                        ⚡ 파생 이슈
                                    </span>
                                    <p className="mt-1 text-sm text-content-primary leading-relaxed">
                                        {renderBulletText(item.text)}
                                    </p>
                                    {linkedVote && (
                                        <VoteNudge vote={linkedVote} className="mt-1.5" />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-1 gap-y-1">
                                    <span className="w-11 shrink-0 text-[13px] font-medium text-content-muted">
                                        {item.timeLabel ?? '–'}
                                    </span>
                                    <p className="w-full sm:w-auto sm:flex-1 min-w-0 text-sm text-content-primary leading-relaxed">
                                        {renderBulletText(item.text)}
                                    </p>
                                </div>
                                {linkedVote && (
                                    <VoteNudge vote={linkedVote} className="mt-1.5 sm:pl-12" />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    })

    const hasCollapsible = collapsible.length > 0

    return (
        <div>
            {/* 헤더: 한 줄 - 타임라인 제목 / 정렬 세그먼트 컨트롤 / 구분선 / 읽기시간 */}
            <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-content-primary">타임라인</h2>
                {userId && (
                    <div className="order-3 sm:order-2 ml-auto flex items-center rounded-full border border-border p-0.5">
                        {SORT_MODES.map(mode => (
                            <button
                                key={mode}
                                onClick={() => { setSortMode(mode); setShowAll(false) }}
                                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                                    sortMode === mode
                                        ? 'bg-[#7b3aed] text-white font-bold'
                                        : 'text-content-muted hover:text-content-secondary'
                                }`}
                            >
                                {SORT_LABEL[mode]}
                            </button>
                        ))}
                    </div>
                )}
                {typeof timelineReadingMinutes === 'number' && (
                    <span className={`order-2 sm:order-3 flex items-center gap-1 text-xs text-content-secondary shrink-0 ${userId ? 'sm:pl-2 sm:border-l sm:border-border-muted' : 'ml-auto'}`}>
                        <Clock className="w-3 h-3" />
                        {timelineReadingMinutes}분이면 다 읽어요
                    </span>
                )}
            </div>

            {rows}

            {hasCollapsible && !userId && collapsible[0] && (
                <div className="relative -mt-1 mb-1 select-none pointer-events-none">
                    {PEEK_BLUR_STEPS.map((step, i) => {
                        const peek = collapsible[i]
                        if (!peek) return null
                        return (
                            <div key={peek.key} className={`flex gap-3 ${step.blur} ${step.opacity} ${i > 0 ? 'mt-3' : ''}`}>
                                <div className="w-2 shrink-0 relative">
                                    <div className={`absolute top-2 left-0 w-2 h-2 rounded-full ${peek.stage === '파생' ? 'bg-[#f97317]' : 'bg-[#7b3aed]'}`} />
                                </div>
                                <div className="flex-1 min-w-0 pb-3">
                                    <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-1 gap-y-1">
                                        <span className="w-11 shrink-0 text-[13px] font-medium text-content-muted">
                                            {peek.timeLabel ?? '–'}
                                        </span>
                                        <p className="w-full sm:w-auto sm:flex-1 min-w-0 text-sm text-content-primary leading-relaxed">
                                            {peek.text.replace(/\*\*/g, '')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-white" />
                </div>
            )}

            {hasCollapsible && !userId && (
                <div className="mt-2 p-4 rounded-xl bg-[#f6f2fe] border border-[#e4d8fb]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold text-content-primary">
                                {collapsedLabel} 기록 {collapsible.length}건이 더 있어요
                            </p>
                            <p className="text-xs text-content-secondary mt-0.5">
                                로그인하면 이 이슈의 전체 흐름을 볼 수 있어요
                            </p>
                        </div>
                        <button
                            onClick={() => goToLogin()}
                            className="w-full sm:w-auto shrink-0 px-5 py-2 rounded-full bg-[#7b3aed] text-white text-sm font-bold hover:opacity-90 transition-opacity"
                        >
                            로그인하기 →
                        </button>
                    </div>
                </div>
            )}

            {hasCollapsible && userId && (
                <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full flex items-center justify-center gap-1 mt-2 py-2 rounded-full border border-border text-xs text-content-secondary hover:bg-surface-subtle transition-colors"
                >
                    {showAll ? (
                        <>접기 <ChevronUp className="w-3 h-3" /></>
                    ) : (
                        <>{collapsedLabel} 기록 {collapsible.length}건 보기 <ChevronDown className="w-3 h-3" /></>
                    )}
                </button>
            )}

            {/* AI 안내 문구 */}
            <div className="!mt-3 -mx-4 px-4 pt-5 border-t border-border-muted flex items-start gap-2">
                <Bot className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                    AI가 자동 생성한 타임라인으로, 실제 내용과 다를 수 있습니다.
                </p>
            </div>
        </div>
    )
}
