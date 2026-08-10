/**
 * app/admin/(protected)/kpi/page.tsx
 * 
 * [KPI 대시보드 페이지]
 * 
 * 6월 목표 대비 현재 진행 상황을 시각화하고,
 * 주차별 마일스톤 달성 여부를 표시합니다.
 * 
 * 웹디자이너/비전문가를 위한 친절한 설명과 함께 제공됩니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendingUp, AlertCircle, Repeat, FileText } from 'lucide-react'
import { CHANNEL_ORDER, CHANNEL_LABEL, type ChannelKey } from '@/lib/kpi/channels'
import { StatCard, type DeltaStat } from './shared'

interface PeriodComparisonStat {
    newUsers: DeltaStat
    comments: DeltaStat
    issueComments: DeltaStat
    discussionComments: DeltaStat
    reactions: DeltaStat
    votes: DeltaStat
    issues: DeltaStat
    shortforms: DeltaStat
    cardNews: DeltaStat
    uniqueVisitors: DeltaStat
}

interface ConversionRatePeriod {
    signupRate: number
    voteRate: number
    commentRate: number
    reactionRate: number
    uniqueVisitors: number
    signups: number
    votes: number
    comments: number
    reactions: number
}

interface ChannelInboundStat {
    visitors: number
    signups: number
    signupRate: number
    comments: number
    commentRate: number
    reactions: number
    reactionRate: number
    votes: number
    voteRate: number
    discussionComments: number
    discussionCommentRate: number
}

const EMPTY_CHANNEL_STAT: ChannelInboundStat = {
    visitors: 0,
    signups: 0, signupRate: 0,
    comments: 0, commentRate: 0,
    reactions: 0, reactionRate: 0,
    votes: 0, voteRate: 0,
    discussionComments: 0, discussionCommentRate: 0,
}

interface KPIMetrics {
    currentUsers: number
    internalUsersCount: number
    currentActiveIssues: number   // 진행중 (점화 + 논란중)
    currentTotalIssues: number    // 전체 승인 (종결 포함)
    currentComments: number
    currentIssueComments: number
    currentDiscussionOpinions: number
    currentReactions: number
    currentVotes: number
    
    // 방문자 지표
    todayPageViews: number
    todayUniqueVisitors: number
    weeklyPageViews: number
    weeklyUniqueVisitors: number
    monthlyPageViews: number
    monthlyUniqueVisitors: number
    visitorsBySource: {
        d1:  { threads: number; instagram: number; youtube: number; tiktok: number; naverBlog: number; organic: number; other: number }
        d7:  { threads: number; instagram: number; youtube: number; tiktok: number; naverBlog: number; organic: number; other: number }
        d30: { threads: number; instagram: number; youtube: number; tiktok: number; naverBlog: number; organic: number; other: number }
    }
    channelInboundByPeriod: {
        d1:  Record<ChannelKey, ChannelInboundStat>
        d7:  Record<ChannelKey, ChannelInboundStat>
        d30: Record<ChannelKey, ChannelInboundStat>
    }
    conversionRates: {
        signupRate: number
        voteRate: number
        commentRate: number
        reactionRate: number
    }
    conversionRatesByPeriod: {
        d1: ConversionRatePeriod
        d7: ConversionRatePeriod
        d30: ConversionRatePeriod
    }
    issueQuality: {
        avgVotesPerIssue: number
        avgCommentsPerIssue: number
        avgReactionsPerIssue: number
        topCategory: string | null
    }
    
    commentParticipation: number
    issueCommentParticipation: number
    discussionCommentParticipation: number
    reactionParticipation: number
    voteParticipation: number
    monthlyActiveCommenters: number
    monthlyActiveIssueCommenters: number
    monthlyActiveDiscussionCommenters: number
    monthlyActiveReactors: number
    monthlyActiveVoters: number
    dailyNewUsers: number
    dailyComments: number
    dailyReactions: number
    weeklyGrowthRate: number
    usersLastWeek: number
    userProgress: number
    commentProgress: number
    reactionProgress: number
    voteProgress: number
    stageTargets: {
        comments: number
        reactions: number
        votes: number
        commentProgress: number
        reactionProgress: number
        voteProgress: number
    }
    periodComparison: {
        d1:  PeriodComparisonStat
        d7:  PeriodComparisonStat
        d30: PeriodComparisonStat
    }
    sparklines: {
        newUsers:  number[]
        comments:  number[]
        reactions: number[]
        votes:     number[]
    }
    todayIssues: number
    monthlyIssues: number
    todayShortforms: number
    monthlyShortforms: number
    todayCardNews: number
    monthlyCardNews: number
    todayNewUsers: number
    todayComments: number
    todayReactions: number
    periodStats: {
        d1:  { newUsers: number; comments: number; issueComments: number; discussionComments: number; reactions: number; votes: number; issues: number; shortforms: number; cardNews: number }
        d7:  { newUsers: number; comments: number; issueComments: number; discussionComments: number; reactions: number; votes: number; issues: number; shortforms: number; cardNews: number }
        d30: { newUsers: number; comments: number; issueComments: number; discussionComments: number; reactions: number; votes: number; issues: number; shortforms: number; cardNews: number }
    }
    weeklyBreakdown: {
        week: number; label: string
        newUsers: number; comments: number; issueComments: number; discussionComments: number; reactions: number; votes: number
        issues: number; shortforms: number; cardNews: number; pageViews: number
        uniqueVisitors: number; signups: number
        signupRate: number; voteRate: number; commentRate: number; reactionRate: number
        channelInbound: Record<ChannelKey, ChannelInboundStat>
    }[] | null
    targets: {
        users: number
        activeIssues: number
        comments: number
        reactions: number
        votes: number
        commentParticipation: number
        reactionParticipation: number
        voteParticipation: number
        dailyNewUsers: number
        dailyComments: number
        dailyReactions: number
        dailyIssues: number
        dailyShortformsPerPlatform: number
        pageviews: number
    }
}

interface WeeklyProgress {
    week: number
    startDate: string
    endDate: string
    targetUsers: number
    targetComments: number
    currentUsers: number
    currentComments: number
    userAchieved: boolean
    commentAchieved: boolean
    isCurrent: boolean
    isPast: boolean
}

interface KPIResponse {
    metrics: KPIMetrics
    weeklyProgress: WeeklyProgress[]
    goalInfo: {
        year: number
        month: number
        periodStart: string
        periodEnd: string
        notes: string | null
    } | null
    generatedAt: string
}

export default function KPIDashboardPage() {
    const [data, setData] = useState<KPIResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [showHelp, setShowHelp] = useState<string | null>(null)
    const [exporting, setExporting] = useState<'weekly' | 'monthly' | null>(null)
    const [exportResult, setExportResult] = useState<{ url: string | null; label: string; sheetName: string } | null>(null)
    const [nextMonthSuggestion, setNextMonthSuggestion] = useState<{
        nextMonth: { year: number; month: number }
        suggested: Record<string, number>
        sql: string
    } | null>(null)
    const [loadingNextMonth, setLoadingNextMonth] = useState(false)
    const [sqlCopied, setSqlCopied] = useState(false)
    const [planMode, setPlanMode] = useState<'growth' | 'same'>('growth')
    
    // 월 선택 (5월은 건너뛰고 6월부터 시작)
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    
    // 5월이면 자동으로 6월로, 아니면 현재 월
    const initialMonth = (currentYear === 2026 && currentMonth === 5) ? 6 : currentMonth
    
    const [selectedYear, setSelectedYear] = useState(currentYear)
    const [selectedMonth, setSelectedMonth] = useState(initialMonth)
    const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 30>(1)
    const [selectedWeek, setSelectedWeek] = useState<number | 'all'>('all') // 과거 월 전용
    const [selectedTab, setSelectedTab] = useState<'today' | 'plan'>('today')

    const fetchData = async (year?: number, month?: number) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (year) params.append('year', year.toString())
            if (month) params.append('month', month.toString())
            
            const res = await fetch(`/api/admin/kpi?${params.toString()}`)
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (error) {
            console.error('[KPI Dashboard] 데이터 로드 에러:', error)
        } finally {
            setLoading(false)
        }
    }

    const exportToSheets = async (kind: 'weekly' | 'monthly') => {
        setExporting(kind)
        setExportResult(null)
        try {
            const res = await fetch('/api/admin/export-kpi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: selectedYear, month: selectedMonth, kind }),
            })
            const json = await res.json()
            if (json.success) {
                setExportResult({ url: json.sheetUrl, label: json.label, sheetName: json.sheetName })
            } else {
                alert(`내보내기 실패: ${json.error}`)
            }
        } catch {
            alert('내보내기 중 오류가 발생했습니다.')
        } finally {
            setExporting(null)
        }
    }

    const fetchNextMonthSuggestion = async () => {
        setLoadingNextMonth(true)
        try {
            const res = await fetch(`/api/admin/kpi/suggest-next-month`)
            if (res.ok) {
                const json = await res.json()
                setNextMonthSuggestion(json)
            }
        } catch (error) {
            console.error('[KPI] 익월 목표 계산 에러:', error)
        } finally {
            setLoadingNextMonth(false)
        }
    }

    const applySameAsThisMonth = () => {
        if (!data?.goalInfo) {
            alert('이번달 목표가 설정되어 있지 않아 복사할 수 없습니다.')
            return
        }
        const t = data.metrics.targets
        const month = selectedMonth
        const year = selectedYear
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate()

        const pad = (n: number) => String(n).padStart(2, '0')
        const periodStart = `${nextYear}-${pad(nextMonth)}-01`
        const periodEnd = `${nextYear}-${pad(nextMonth)}-${daysInNextMonth}`

        const suggested = {
            target_users: t.users,
            target_active_issues: t.activeIssues,
            target_comments: t.comments,
            target_reactions: t.reactions,
            target_votes: t.votes,
            target_daily_new_users: t.dailyNewUsers,
            target_daily_comments: t.dailyComments,
            target_daily_reactions: t.dailyReactions,
            target_daily_issues: t.dailyIssues,
            target_daily_shortforms_per_platform: t.dailyShortformsPerPlatform,
            target_pageviews: t.pageviews,
        }

        const sql =
`INSERT INTO kpi_goals (
    period_year, period_month, period_start, period_end,
    target_users, target_active_issues, target_comments, target_reactions, target_votes,
    target_comment_participation, target_reaction_participation, target_vote_participation,
    target_daily_new_users, target_daily_comments, target_daily_reactions,
    target_daily_issues, target_daily_shortforms_per_platform,
    notes, is_active
) VALUES (
    ${nextYear}, ${nextMonth}, '${periodStart}', '${periodEnd}',
    ${suggested.target_users}, ${suggested.target_active_issues}, ${suggested.target_comments}, ${suggested.target_reactions}, ${suggested.target_votes},
    ${t.commentParticipation}, ${t.reactionParticipation}, ${t.voteParticipation},
    ${suggested.target_daily_new_users}, ${suggested.target_daily_comments}, ${suggested.target_daily_reactions},
    ${suggested.target_daily_issues}, ${suggested.target_daily_shortforms_per_platform},
    '${nextMonth}월 목표: ${month}월과 동일 유지', true
) ON CONFLICT (period_year, period_month) DO UPDATE SET
    target_users = EXCLUDED.target_users,
    target_active_issues = EXCLUDED.target_active_issues,
    target_comments = EXCLUDED.target_comments,
    target_reactions = EXCLUDED.target_reactions,
    target_votes = EXCLUDED.target_votes,
    target_daily_new_users = EXCLUDED.target_daily_new_users,
    target_daily_comments = EXCLUDED.target_daily_comments,
    target_daily_reactions = EXCLUDED.target_daily_reactions,
    target_daily_issues = EXCLUDED.target_daily_issues,
    target_daily_shortforms_per_platform = EXCLUDED.target_daily_shortforms_per_platform,
    notes = EXCLUDED.notes,
    updated_at = NOW();`

        setNextMonthSuggestion({
            nextMonth: { year: nextYear, month: nextMonth },
            suggested,
            sql,
        })
    }

    const copySQL = async () => {
        if (!nextMonthSuggestion?.sql) return
        await navigator.clipboard.writeText(nextMonthSuggestion.sql)
        setSqlCopied(true)
        setTimeout(() => setSqlCopied(false), 2000)
    }

    useEffect(() => {
        fetchData(selectedYear, selectedMonth)
    }, [selectedYear, selectedMonth])

    // 월 변경 핸들러
    const handleMonthChange = (year: number, month: number) => {
        setSelectedYear(year)
        setSelectedMonth(month)
        setSelectedWeek('all')
    }

    // 이전/다음 월 이동 (2026년 5월은 건너뛰기)
    const handlePrevMonth = () => {
        // 2026년 6월에서는 5월로 이동 불가
        if (selectedYear === 2026 && selectedMonth === 6) {
            return
        }
        
        if (selectedMonth === 1) {
            setSelectedYear(selectedYear - 1)
            setSelectedMonth(12)
        } else {
            setSelectedMonth(selectedMonth - 1)
        }
    }

    const handleNextMonth = () => {
        if (selectedMonth === 12) {
            setSelectedYear(selectedYear + 1)
            setSelectedMonth(1)
        } else {
            setSelectedMonth(selectedMonth + 1)
        }
    }

    if (loading && !data) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-content-primary">KPI 리포트</h1>
                <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 bg-surface-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-content-primary">KPI 리포트</h1>
                <div className="card p-8 text-center">
                    <p className="text-content-muted">데이터를 불러올 수 없습니다</p>
                </div>
            </div>
        )
    }

    const { metrics } = data

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">KPI 리포트</h1>
                    <p className="text-sm text-content-secondary mt-1">
                        {data?.goalInfo
                            ? `목표 기간: ${data.goalInfo.periodStart} - ${data.goalInfo.periodEnd}`
                            : '목표 기간 정보 없음'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* 월 네비게이션 */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handlePrevMonth}
                            disabled={selectedYear === 2026 && selectedMonth === 6}
                            className="p-2 hover:bg-surface-muted rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={selectedYear === 2026 && selectedMonth === 6 ? '5월 데이터는 제외됩니다' : '이전 월'}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="px-4 py-2 bg-surface-subtle border border-border rounded-lg min-w-[120px] text-center">
                            <span className="text-base font-semibold text-content-primary">
                                {selectedYear}년 {selectedMonth}월
                            </span>
                        </div>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                            title="다음 월"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    {/* HTML 리포트 */}
                    <Link
                        href="/admin/kpi/report"
                        className="px-3 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
                        title="인쇄/PDF 친화적인 HTML 리포트 보기"
                    >
                        <FileText className="w-4 h-4" />
                        HTML 리포트
                    </Link>

                    {/* Sheets 내보내기 버튼은 잠시 숨김 (기능/코드는 유지) */}
                    {exportResult && (
                        <span className="text-xs text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                            ✅ {exportResult.sheetName} · {exportResult.label} 저장됨
                            {exportResult.url && (
                                <a href={exportResult.url} target="_blank" rel="noopener noreferrer"
                                    className="underline ml-1">
                                    시트 열기
                                </a>
                            )}
                        </span>
                    )}
                </div>
            </div>

            {/* 목표가 없을 때 안내 */}
            {data && !data.goalInfo && (
                <div className="card p-6 border-2 border-yellow-300 bg-yellow-50">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-yellow-100">
                            <AlertCircle className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold mb-1 text-yellow-800">
                                {selectedYear}년 {selectedMonth}월 KPI 목표가 설정되지 않았습니다
                            </h2>
                            <p className="text-sm text-yellow-700 mb-3">
                                이 월의 KPI 목표를 설정하려면 Supabase에서 `kpi_goals` 테이블에 데이터를 추가하세요.
                            </p>
                            <div className="text-sm text-yellow-700">
                                <p className="font-medium mb-1">설정 방법:</p>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                    <li>Supabase Dashboard 열기</li>
                                    <li>SQL Editor에서 `supabase/migrations/20260508_kpi_goals.sql` 실행</li>
                                    <li>또는 Table Editor에서 직접 `kpi_goals` 테이블에 데이터 추가</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {data && data.goalInfo && (
                <>
                    {/* 월 목표 기준 */}
                    <div className="card p-4 bg-blue-50 border border-blue-200 space-y-3">
                        <p className="text-sm font-semibold text-blue-700">{selectedMonth}월 목표</p>
                        {([
                            {
                                group: '① 콘텐츠 제작',
                                items: [
                                    `이슈 승인 일 ${metrics.targets.dailyIssues}개`,
                                    `숏폼 등록 일 ${metrics.targets.dailyShortformsPerPlatform}개`,
                                    `카드뉴스 등록 일 1개`,
                                ],
                            },
                            {
                                group: '② 유입 · 성장',
                                items: [
                                    `신규 가입자 ${metrics.targets.users}명`,
                                    `페이지뷰 ${metrics.targets.pageviews.toLocaleString()}회 (가입자 목표×10)`,
                                ],
                            },
                            {
                                group: '③ 참여 · 반응',
                                items: [
                                    `이슈 댓글 ${metrics.targets.comments}개 (참여율 ${metrics.targets.commentParticipation}%)`,
                                    `토론 의견 ${metrics.targets.comments}개 (참여율 ${metrics.targets.commentParticipation}%)`,
                                    `반응 ${metrics.targets.reactions}개 (참여율 ${metrics.targets.reactionParticipation}%)`,
                                    `투표 ${metrics.targets.votes}회 (참여율 ${metrics.targets.voteParticipation}%)`,
                                ],
                            },
                        ]).map(({ group, items }) => (
                            <div key={group}>
                                <p className="text-xs font-semibold text-blue-600 mb-1.5">{group}</p>
                                <div className="flex flex-wrap gap-2">
                                    {items.map((item, i) => (
                                        <span key={i} className="text-sm px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-900 font-medium">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

            {/* 가입자 현황 */}
            <div className="card p-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-content-primary whitespace-nowrap">가입자 현황</h2>
                    <div className="grid grid-cols-3 gap-3 flex-1">
                        <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500">전체</p>
                            <p className="text-xl font-bold text-slate-900">{(metrics.currentUsers + metrics.internalUsersCount).toLocaleString()}명</p>
                        </div>
                        <div className="px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 text-center">
                            <p className="text-xs text-blue-600">일반 유저</p>
                            <p className="text-xl font-bold text-blue-900">{metrics.currentUsers.toLocaleString()}명</p>
                        </div>
                        <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500">내부 계정</p>
                            <p className="text-xl font-bold text-slate-600">{metrics.internalUsersCount.toLocaleString()}명</p>
                        </div>
                    </div>
                </div>
            </div>

            <h2 className="text-sm font-semibold text-content-primary">{selectedMonth}월 목표 달성 현황</h2>

            {/* 탭 네비게이션 */}
            <div className="flex border-b border-border-muted">
                {([
                    { id: 'today', label: '운영 현황' },
                    { id: 'plan',  label: '다음달 목표' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            selectedTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-content-muted hover:text-content-primary'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {selectedTab === 'today' && <>
            {/* 기간 토글 */}
            {(() => {
                const now = new Date()
                const kstYear  = now.getFullYear()
                const kstMonth = now.getMonth() + 1
                const isPastMonth = !(selectedYear === kstYear && selectedMonth === kstMonth)

                if (isPastMonth) {
                    // 과거 월: 주차 버튼 + N월 전체
                    const weeks = data?.metrics.weeklyBreakdown ?? []
                    const tabs: { key: number | 'all'; label: string }[] = [
                        ...weeks.map(w => ({ key: w.week as number | 'all', label: w.label })),
                        { key: 'all', label: `${selectedMonth}월 전체` },
                    ]
                    return (
                        <div className="flex p-1 bg-surface-muted rounded-xl w-fit flex-wrap gap-1">
                            {tabs.map(t => (
                                <button
                                    key={String(t.key)}
                                    onClick={() => setSelectedWeek(t.key)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        selectedWeek === t.key
                                            ? 'bg-white shadow text-content-primary'
                                            : 'text-content-muted hover:text-content-primary'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )
                }

                // 현재 월: 기존 오늘/이번주/이번달 토글
                const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
                const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
                const fmtDay = (d: Date) => `${fmt(d)}(${DAY_NAMES[d.getDay()]})`
                const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
                const monthEnd   = new Date(selectedYear, selectedMonth, 0)
                const thisWeekStart = new Date(now)
                thisWeekStart.setDate(now.getDate() - now.getDay())
                const thisWeekEnd = new Date(thisWeekStart)
                thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
                const labelWeekStart = thisWeekStart < monthStart ? monthStart : thisWeekStart
                const labelWeekEnd   = thisWeekEnd   > monthEnd   ? monthEnd   : thisWeekEnd
                const firstSunday = new Date(monthStart)
                firstSunday.setDate(monthStart.getDate() - monthStart.getDay())
                const weekNumber = Math.floor((thisWeekStart.getTime() - firstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
                const periodLabel = (p: 1 | 7 | 30) => {
                    if (p === 1) return '오늘 (전일 비교)'
                    if (p === 7) return `이번 주 [${weekNumber}주차 - ${fmtDay(labelWeekStart)} ~ ${fmtDay(labelWeekEnd)}] (전주 비교)`
                    return `이번 달 [${fmt(monthStart)} ~ ${fmt(monthEnd)}] (전월 비교)`
                }
                return (
                    <div className="flex p-1 bg-surface-muted rounded-xl w-fit">
                        {([1, 7, 30] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setSelectedPeriod(p)}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                    selectedPeriod === p
                                        ? 'bg-white shadow text-content-primary'
                                        : 'text-content-muted hover:text-content-primary'
                                }`}
                            >
                                {periodLabel(p)}
                            </button>
                        ))}
                    </div>
                )
            })()}

            {(() => {
                const now2 = new Date()
                const isPastMonth2 = !(selectedYear === now2.getFullYear() && selectedMonth === now2.getMonth() + 1)

                // 표시할 통계: 과거 월이면 주차별 / 현재 월이면 기존 d1·d7·d30
                type StatShape = { newUsers: number; comments: number; issueComments: number; discussionComments: number; reactions: number; votes: number; issues: number; shortforms: number; cardNews: number }
                let pStat: StatShape
                let pageViews: number
                let periodDays: number  // 목표 환산용

                if (isPastMonth2) {
                    const wb = metrics.weeklyBreakdown ?? []
                    if (selectedWeek === 'all') {
                        pStat = metrics.periodStats.d30
                        pageViews = metrics.monthlyPageViews
                        periodDays = 30
                    } else {
                        const ws = wb.find(w => w.week === selectedWeek) ?? wb[0]
                        pStat = ws ?? metrics.periodStats.d30
                        pageViews = ws?.pageViews ?? 0
                        periodDays = 7
                    }
                } else {
                    const pKey = selectedPeriod === 1 ? 'd1' as const : selectedPeriod === 7 ? 'd7' as const : 'd30' as const
                    pStat = metrics.periodStats[pKey]
                    pageViews = selectedPeriod === 1 ? metrics.todayPageViews : selectedPeriod === 7 ? metrics.weeklyPageViews : metrics.monthlyPageViews
                    periodDays = selectedPeriod
                }

                // 숏폼·카드뉴스는 평일에만 올라가는 콘텐츠라, 목표를 달력 일수가 아니라
                // 해당 기간 안의 평일(월~금) 수 기준으로 잡음
                const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6
                const countWeekdays = (start: Date, end: Date) => {
                    let count = 0
                    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
                    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
                    while (cur <= last) {
                        if (isWeekday(cur)) count++
                        cur.setDate(cur.getDate() + 1)
                    }
                    return count
                }

                let weekdayCount: number
                if (isPastMonth2) {
                    const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
                    const monthEnd = new Date(selectedYear, selectedMonth, 0)
                    if (selectedWeek === 'all') {
                        weekdayCount = countWeekdays(monthStart, monthEnd)
                    } else {
                        const weekStartDay = (selectedWeek - 1) * 7 + 1
                        const weekEndDay = Math.min(selectedWeek * 7, monthEnd.getDate())
                        weekdayCount = countWeekdays(
                            new Date(selectedYear, selectedMonth - 1, weekStartDay),
                            new Date(selectedYear, selectedMonth - 1, weekEndDay)
                        )
                    }
                } else {
                    const todayLocal = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate())
                    if (selectedPeriod === 1) {
                        weekdayCount = isWeekday(todayLocal) ? 1 : 0
                    } else if (selectedPeriod === 7) {
                        // 오늘까지가 아니라 이번 주(일~토) 전체 기준 — 다른 목표들과 동일하게 고정된 주간 목표
                        const weekStart = new Date(todayLocal)
                        weekStart.setDate(todayLocal.getDate() - todayLocal.getDay())
                        const weekEnd = new Date(weekStart)
                        weekEnd.setDate(weekStart.getDate() + 6)
                        weekdayCount = countWeekdays(weekStart, weekEnd)
                    } else {
                        // 오늘까지가 아니라 이번 달 전체 기준
                        const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
                        const monthEnd = new Date(selectedYear, selectedMonth, 0)
                        weekdayCount = countWeekdays(monthStart, monthEnd)
                    }
                }

                const t = metrics.targets
                const issueTarget     = t.dailyIssues * periodDays
                const shortformTarget = t.dailyShortformsPerPlatform * weekdayCount
                const cardNewsTarget  = weekdayCount
                const userTarget      = t.dailyNewUsers * periodDays
                const commentTarget   = t.dailyComments * periodDays
                const reactionTarget  = t.dailyReactions * periodDays
                const voteTarget      = Math.round(t.votes / 30 * periodDays)
                const pvTarget        = Math.round(t.pageviews / 30 * periodDays)

                // 채널/전환율 계산 (과거 월은 주차별 weeklyBreakdown 항목 사용)
                const pKey = isPastMonth2
                    ? 'd30' as const
                    : selectedPeriod === 1 ? 'd1' as const : selectedPeriod === 7 ? 'd7' as const : 'd30' as const
                const src = metrics.visitorsBySource[pKey]
                const selectedWeekStat = isPastMonth2 && selectedWeek !== 'all'
                    ? (metrics.weeklyBreakdown ?? []).find(w => w.week === selectedWeek) ?? null
                    : null
                const conv = selectedWeekStat
                    ? {
                        signupRate:   selectedWeekStat.signupRate,
                        voteRate:     selectedWeekStat.voteRate,
                        commentRate:  selectedWeekStat.commentRate,
                        reactionRate: selectedWeekStat.reactionRate,
                        uniqueVisitors: selectedWeekStat.uniqueVisitors,
                        signups:      selectedWeekStat.signups,
                        votes:        selectedWeekStat.votes,
                        comments:     selectedWeekStat.comments,
                        reactions:    selectedWeekStat.reactions,
                    }
                    : metrics.conversionRatesByPeriod?.[pKey]
                const periodVisitors = selectedWeekStat
                    ? selectedWeekStat.uniqueVisitors
                    : isPastMonth2
                        ? metrics.monthlyUniqueVisitors
                        : selectedPeriod === 1
                            ? metrics.todayUniqueVisitors
                            : selectedPeriod === 7
                                ? metrics.weeklyUniqueVisitors
                                : metrics.monthlyUniqueVisitors

                // 전일/전주/전월 비교 (과거 달의 특정 주차를 보는 중이면 대응하는 비교 기준이 없어 생략)
                const cmp = selectedWeekStat ? null : metrics.periodComparison[pKey]

                return (
                    <>
                    {/* ① 콘텐츠 제작 */}
                    <div className="card p-5">
                        <div className="flex items-baseline gap-2 mb-4">
                            <h2 className="text-base font-semibold text-content-primary whitespace-nowrap">① 콘텐츠 제작</h2>
                            <p className="text-sm text-content-secondary">사이트용(이슈)과 외부 홍보용(숏폼·카드뉴스)을 계획한 만큼 만들고 있는가?</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard label="이슈 승인"   caption={`일 ${t.dailyIssues}개 · 사이트`} current={pStat.issues} unit="개"
                                note={`목표 ${issueTarget.toLocaleString()}개`} delta={cmp?.issues} />
                            <StatCard label="숏폼 등록"   caption={`일 ${t.dailyShortformsPerPlatform}개 · 외부`} current={pStat.shortforms} unit="개"
                                note={`목표 ${shortformTarget.toLocaleString()}개`} delta={cmp?.shortforms} />
                            <StatCard label="카드뉴스 등록" caption="일 1개 · 외부" current={pStat.cardNews} unit="개"
                                note={`목표 ${cardNewsTarget.toLocaleString()}개`} delta={cmp?.cardNews} />
                        </div>
                    </div>

                    {/* ② 유입·성장 */}
                    <div className="card p-5">
                        <div className="flex items-baseline gap-2 mb-4">
                            <h2 className="text-base font-semibold text-content-primary whitespace-nowrap">② 유입 · 성장</h2>
                            <p className="text-sm text-content-secondary">사람들이 실제로 우리 서비스를 찾아오고 있는가?</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard
                                label="신규 가입자"
                                caption="일반 유저"
                                current={pStat.newUsers}
                                unit="명"
                                note={`목표 ${userTarget.toLocaleString()}명`}
                                rateLabel={conv ? '가입전환율' : undefined}
                                rateValue={conv ? `${conv.signupRate.toFixed(1)}%` : undefined}
                                delta={cmp?.newUsers}
                            />
                            <StatCard
                                label="순방문자"
                                caption="같은 사람 중복 제외, 세션 기준"
                                current={periodVisitors}
                                unit="명"
                                delta={cmp?.uniqueVisitors}
                                infoTooltip="같은 사람이 여러 페이지를 봐도 한 번만 세는, 실제 방문 횟수예요. 브라우저(세션) 기준이라 폰·PC로 각각 들어오면 2명으로 잡히는 등 실제 인원수와 정확히 같지는 않아요."
                            />
                            <StatCard
                                label="페이지뷰"
                                caption={`목표 ${pvTarget.toLocaleString()}회`}
                                current={pageViews}
                                unit="회"
                                note={periodVisitors > 0 ? `1인당 평균 ${(pageViews / periodVisitors).toFixed(1)}페이지` : undefined}
                                infoTooltip="이슈·홈 같은 페이지가 열린 총 횟수예요. 한 사람이 여러 페이지를 보면 그만큼 여러 번 셈해져서, 순방문자보다 항상 크거나 같아요."
                            />
                        </div>

                        <div className="mt-5 pt-5 border-t border-border-muted">
                            <div className="flex items-baseline gap-2 mb-4">
                                <h3 className="text-sm font-semibold text-content-primary whitespace-nowrap">채널별 유입 · 참여 전환율</h3>
                                <p className="text-sm text-content-secondary">
                                    채널별 순방문자 대비 가입/이슈댓글/토론의견/반응/투표 전환율 (전부 첫 방문 UTM 기준)
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-content-secondary border-b border-border">
                                        <th className="text-left py-2 pr-4 font-medium">채널</th>
                                        <th className="text-right py-2 px-3 font-medium">방문자</th>
                                        <th className="text-right py-2 px-3 font-medium">가입전환율</th>
                                        <th className="text-right py-2 px-3 font-medium">이슈댓글전환율</th>
                                        <th className="text-right py-2 px-3 font-medium">토론의견전환율</th>
                                        <th className="text-right py-2 px-3 font-medium">반응전환율</th>
                                        <th className="text-right py-2 pl-3 font-medium">투표전환율</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const channels = CHANNEL_ORDER.map(key => ({ label: CHANNEL_LABEL[key], key }))

                                        const rows = channels.map(({ label, key }) => {
                                            const fallbackVisitors = {
                                                instagram: src.instagram,
                                                threads: src.threads,
                                                youtube: src.youtube,
                                                tiktok: src.tiktok,
                                                naverBlog: src.naverBlog,
                                                organic: src.organic,
                                                other: src.other,
                                            }[key]
                                            const stat = selectedWeekStat
                                                ? (selectedWeekStat.channelInbound?.[key] ?? EMPTY_CHANNEL_STAT)
                                                : (metrics.channelInboundByPeriod?.[pKey]?.[key]
                                                    ?? { ...EMPTY_CHANNEL_STAT, visitors: fallbackVisitors })
                                            return { label, key, stat }
                                        })

                                        const totalVisitors = rows.reduce((sum, r) => sum + r.stat.visitors, 0)
                                        const sumField = (field: keyof ChannelInboundStat) =>
                                            rows.reduce((sum, r) => sum + r.stat[field], 0)
                                        const weightedRate = (count: number) => totalVisitors > 0 ? (count / totalVisitors) * 100 : 0
                                        const totalRow: ChannelInboundStat = {
                                            visitors: totalVisitors,
                                            signups: sumField('signups'),   signupRate: weightedRate(sumField('signups')),
                                            comments: sumField('comments'), commentRate: weightedRate(sumField('comments')),
                                            reactions: sumField('reactions'), reactionRate: weightedRate(sumField('reactions')),
                                            votes: sumField('votes'),       voteRate: weightedRate(sumField('votes')),
                                            discussionComments: sumField('discussionComments'),
                                            discussionCommentRate: weightedRate(sumField('discussionComments')),
                                        }
                                        const visitorsMatch = totalVisitors === periodVisitors

                                        const RateCell = ({ rate, hasVisitors }: { rate: number; hasVisitors: boolean }) => (
                                            <td className="py-3 px-3 text-right">
                                                <span className={`font-semibold ${
                                                    rate >= 5 ? 'text-emerald-700' : hasVisitors ? 'text-content-primary' : 'text-content-muted'
                                                }`}>
                                                    {hasVisitors ? `${rate.toFixed(1)}%` : '-'}
                                                </span>
                                            </td>
                                        )

                                        return (
                                            <>
                                                {rows.map(({ label, key, stat }) => {
                                                    const hasVisitors = stat.visitors > 0
                                                    return (
                                                        <tr key={key} className="border-b border-border-muted last:border-0">
                                                            <td className="py-3 pr-4 font-medium text-content-primary">{label}</td>
                                                            <td className="py-3 px-3 text-right text-content-primary">
                                                                {stat.visitors.toLocaleString()}명
                                                            </td>
                                                            <RateCell rate={stat.signupRate} hasVisitors={hasVisitors} />
                                                            <RateCell rate={stat.commentRate} hasVisitors={hasVisitors} />
                                                            <RateCell rate={stat.discussionCommentRate} hasVisitors={hasVisitors} />
                                                            <RateCell rate={stat.reactionRate} hasVisitors={hasVisitors} />
                                                            <RateCell rate={stat.voteRate} hasVisitors={hasVisitors} />
                                                        </tr>
                                                    )
                                                })}
                                                <tr className="bg-surface-subtle font-semibold">
                                                    <td className="py-3 pr-4 text-content-primary">
                                                        합계(가중평균)
                                                        <span className={`ml-2 text-xs font-normal ${visitorsMatch ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {visitorsMatch ? '✓ 순방문자 일치' : `⚠ 순방문자 불일치 (전체 ${periodVisitors.toLocaleString()}명)`}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-right text-content-primary">{totalRow.visitors.toLocaleString()}명</td>
                                                    <RateCell rate={totalRow.signupRate} hasVisitors={totalRow.visitors > 0} />
                                                    <RateCell rate={totalRow.commentRate} hasVisitors={totalRow.visitors > 0} />
                                                    <RateCell rate={totalRow.discussionCommentRate} hasVisitors={totalRow.visitors > 0} />
                                                    <RateCell rate={totalRow.reactionRate} hasVisitors={totalRow.visitors > 0} />
                                                    <RateCell rate={totalRow.voteRate} hasVisitors={totalRow.visitors > 0} />
                                                </tr>
                                            </>
                                        )
                                    })()}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                    {/* ③ 참여·반응 */}
                    <div className="card p-5">
                        <div className="flex items-baseline gap-2 mb-4">
                            <h2 className="text-base font-semibold text-content-primary whitespace-nowrap">③ 참여 · 반응</h2>
                            <p className="text-sm text-content-secondary">찾아온 사람들이 실제로 반응하고 있는가? (봇 제외)</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <StatCard
                                label="이슈 댓글"
                                current={pStat.issueComments}
                                unit="개"
                                note={`목표 ${commentTarget.toLocaleString()}개`}
                                rateLabel="이번 달 참여율"
                                rateValue={`${metrics.issueCommentParticipation.toFixed(1)}%`}
                                delta={cmp?.issueComments}
                            />
                            <StatCard
                                label="토론 의견"
                                current={pStat.discussionComments}
                                unit="개"
                                note={`목표 ${commentTarget.toLocaleString()}개`}
                                rateLabel="이번 달 참여율"
                                rateValue={`${metrics.discussionCommentParticipation.toFixed(1)}%`}
                                delta={cmp?.discussionComments}
                            />
                            <StatCard
                                label="반응"
                                current={pStat.reactions}
                                unit="개"
                                note={`목표 ${reactionTarget.toLocaleString()}개`}
                                rateLabel="이번 달 참여율"
                                rateValue={`${metrics.reactionParticipation.toFixed(1)}%`}
                                delta={cmp?.reactions}
                            />
                            <StatCard
                                label="투표"
                                current={pStat.votes}
                                unit="회"
                                note={`목표 ${voteTarget.toLocaleString()}회`}
                                rateLabel="이번 달 참여율"
                                rateValue={`${metrics.voteParticipation.toFixed(1)}%`}
                                delta={cmp?.votes}
                            />
                        </div>
                    </div>
                    </>
                )
            })()}
            </>}


            {selectedTab === 'plan' && <>
            {/* 다음달 목표 설정 */}
            <div className="card p-6 border-l-4 border-l-emerald-500">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                        {planMode === 'growth'
                            ? <TrendingUp className="w-5 h-5 text-emerald-600" />
                            : <Repeat className="w-5 h-5 text-emerald-600" />}
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-content-primary">다음달 목표 설정</h2>
                        <p className="text-xs text-content-muted">
                            {planMode === 'growth'
                                ? '이번 달 목표 기준 ×1.2로 다음달 목표 자동 제안'
                                : `${selectedMonth}월 목표를 그대로 다음달에도 유지`}
                        </p>
                    </div>
                </div>

                {!nextMonthSuggestion && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPlanMode('growth')}
                                className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                                    planMode === 'growth'
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                        : 'border-border text-content-muted hover:border-emerald-300'
                                }`}
                            >
                                성장 목표 (+20%)
                            </button>
                            <button
                                onClick={() => setPlanMode('same')}
                                className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                                    planMode === 'same'
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                        : 'border-border text-content-muted hover:border-emerald-300'
                                }`}
                            >
                                이번달과 동일하게
                            </button>
                        </div>
                        <button
                            onClick={planMode === 'growth' ? fetchNextMonthSuggestion : applySameAsThisMonth}
                            disabled={loadingNextMonth}
                            className="w-full px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loadingNextMonth ? '계산 중...' : (planMode === 'growth' ? '목표 계산하기' : '동일하게 설정')}
                        </button>
                    </div>
                )}
                {nextMonthSuggestion && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: '신규 가입자', value: nextMonthSuggestion.suggested.target_users, unit: '명' },
                                { label: '댓글', value: nextMonthSuggestion.suggested.target_comments, unit: '개' },
                                { label: '반응', value: nextMonthSuggestion.suggested.target_reactions, unit: '개' },
                                { label: '페이지뷰', value: nextMonthSuggestion.suggested.target_pageviews, unit: '' },
                            ].map(item => (
                                <div key={item.label} className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                    <p className="text-xs text-emerald-700 mb-1">{item.label}</p>
                                    <p className="text-2xl font-bold text-emerald-900">{item.value.toLocaleString()}{item.unit}</p>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 bg-slate-900 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-slate-400 font-mono">
                                    {nextMonthSuggestion.nextMonth.year}년 {nextMonthSuggestion.nextMonth.month}월 목표 INSERT SQL
                                </p>
                                <button
                                    onClick={copySQL}
                                    className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
                                >
                                    {sqlCopied ? '✅ 복사됨' : '📋 복사'}
                                </button>
                            </div>
                            <pre className="text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                                {nextMonthSuggestion.sql}
                            </pre>
                        </div>
                        <p className="text-xs text-content-muted">
                            위 SQL을 Supabase SQL Editor에서 실행하면 다음달 목표가 자동 등록됩니다.
                        </p>
                        <button
                            onClick={() => setNextMonthSuggestion(null)}
                            className="text-xs text-content-muted hover:text-content-secondary underline"
                        >
                            닫기
                        </button>
                    </div>
                )}
            </div>
            </>}

            </>
            )}
        </div>
    )
}
