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
import { TrendingUp, AlertCircle } from 'lucide-react'

interface KPIMetrics {
    currentUsers: number
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
        d1:  { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
        d7:  { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
        d30: { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
    }
    conversionRates: {
        signupRate: number
        voteRate: number
        commentRate: number
        reactionRate: number
    }
    issueQuality: {
        avgVotesPerIssue: number
        avgCommentsPerIssue: number
        avgReactionsPerIssue: number
        topCategory: string | null
    }
    
    commentParticipation: number
    reactionParticipation: number
    voteParticipation: number
    monthlyActiveCommenters: number
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
    weekOverWeek: {
        newUsers:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        comments:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        reactions: { current: number; previous: number; delta: number; deltaPercent: number | null }
        votes:     { current: number; previous: number; delta: number; deltaPercent: number | null }
    }
    monthOverMonth: {
        newUsers:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        comments:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        reactions: { current: number; previous: number; delta: number; deltaPercent: number | null }
        votes:     { current: number; previous: number; delta: number; deltaPercent: number | null }
    }
    sparklines: {
        newUsers:  number[]
        comments:  number[]
        reactions: number[]
        votes:     number[]
    }
    todayIssues: number
    monthlyIssues: number
    todayShortforms: { instagram: number; youtube: number; tiktok: number }
    monthlyShortforms: { instagram: number; youtube: number; tiktok: number }
    todayNewUsers: number
    todayComments: number
    todayReactions: number
    periodStats: {
        d1:  { newUsers: number; comments: number; reactions: number; votes: number; issues: number; shortforms: { instagram: number; youtube: number; tiktok: number } }
        d7:  { newUsers: number; comments: number; reactions: number; votes: number; issues: number; shortforms: { instagram: number; youtube: number; tiktok: number } }
        d30: { newUsers: number; comments: number; reactions: number; votes: number; issues: number; shortforms: { instagram: number; youtube: number; tiktok: number } }
    }
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
    const [exporting, setExporting] = useState(false)
    const [exportResult, setExportResult] = useState<{ url: string | null; label: string } | null>(null)
    const [nextMonthSuggestion, setNextMonthSuggestion] = useState<{
        nextMonth: { year: number; month: number }
        suggested: Record<string, number>
        sql: string
    } | null>(null)
    const [loadingNextMonth, setLoadingNextMonth] = useState(false)
    const [sqlCopied, setSqlCopied] = useState(false)
    
    // 월 선택 (5월은 건너뛰고 6월부터 시작)
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    
    // 5월이면 자동으로 6월로, 아니면 현재 월
    const initialMonth = (currentYear === 2026 && currentMonth === 5) ? 6 : currentMonth
    
    const [selectedYear, setSelectedYear] = useState(currentYear)
    const [selectedMonth, setSelectedMonth] = useState(initialMonth)
    const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 30>(7)
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

    const exportToSheets = async () => {
        setExporting(true)
        setExportResult(null)
        try {
            const res = await fetch('/api/admin/export-kpi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: selectedYear, month: selectedMonth }),
            })
            const json = await res.json()
            if (json.success) {
                setExportResult({ url: json.sheetUrl, label: json.label })
            } else {
                alert(`내보내기 실패: ${json.error}`)
            }
        } catch {
            alert('내보내기 중 오류가 발생했습니다.')
        } finally {
            setExporting(false)
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

    // 도움말 컨텐츠
    const helpContent: Record<string, { title: string; desc: string; good: string; bad: string }> = {
        users: {
            title: '가입자 수란?',
            desc: '왜난리에 가입한 총 회원 수입니다. 서비스 성장의 가장 기본적인 지표입니다.',
            good: '주간 성장률 15% 이상이면 매우 좋습니다.',
            bad: '2주 연속 정체되면 SNS 홍보나 지인 초대를 강화하세요.'
        },
        activeIssues: {
            title: '진행중 이슈란?',
            desc: '지금 뜨고 있는 이슈(점화·논란중) 개수입니다. 유저가 지금 참여할 수 있는 콘텐츠 수를 의미합니다. 종결된 이슈는 제외합니다.',
            good: '주 2-3개씩 꾸준히 등록하는 것이 좋습니다.',
            bad: '5개 미만이면 즉시 이슈를 승인하거나 수동 등록하세요.'
        },
        comments: {
            title: '댓글 수란?',
            desc: '이슈와 토론에 달린 모든 댓글 개수입니다. 사용자 참여도를 보여주는 핵심 지표입니다.',
            good: '이슈당 평균 4개 이상이면 활발한 토론이 일어나는 중입니다.',
            bad: '댓글이 적다면 UI를 개선하거나 베스트 댓글 이벤트를 진행하세요.'
        },
        reactions: {
            title: '반응 수란?',
            desc: '이슈에 남긴 감정 반응(화남, 놀람 등) 개수입니다. 가장 쉬운 참여 방식입니다.',
            good: '반응 참여율 50% 이상이면 콘텐츠가 공감을 얻고 있습니다.',
            bad: '반응이 적다면 감정 버튼을 더 눈에 띄게 만드세요.'
        },
        votes: {
            title: '투표 참여란?',
            desc: '이슈의 찬성/반대 투표 참여 횟수입니다. 의견을 표현하는 방식입니다.',
            good: '투표 참여율 15% 이상이면 사용자들이 적극적으로 의견을 내고 있습니다.',
            bad: '투표가 적다면 투표 UI를 개선하거나 투표 유도 문구를 추가하세요.'
        },
        commentParticipation: {
            title: '댓글 참여율이란?',
            desc: '전체 가입자 중 댓글을 남긴 사람의 비율입니다. (댓글 수 ÷ 가입자 수 × 100)',
            good: '20% 이상이면 매우 건강한 커뮤니티입니다.',
            bad: '10% 미만이면 댓글 입력창을 개선하거나 댓글 작성을 유도하세요.'
        },
        reactionParticipation: {
            title: '반응 참여율이란?',
            desc: '전체 가입자 중 반응을 남긴 사람의 비율입니다. (반응 수 ÷ 가입자 수 × 100)',
            good: '50% 이상이면 콘텐츠가 충분히 흥미롭습니다.',
            bad: '30% 미만이면 이슈 품질을 개선하거나 반응 버튼을 강조하세요.'
        },
        voteParticipation: {
            title: '투표 참여율이란?',
            desc: '전체 가입자 중 투표한 사람의 비율입니다. (투표 수 ÷ 가입자 수 × 100)',
            good: '15% 이상이면 사용자들이 적극적으로 의견을 내고 있습니다.',
            bad: '10% 미만이면 투표 UI/UX를 개선하세요.'
        },
        dailyNewUsers: {
            title: '일평균 신규 가입이란?',
            desc: '최근 7일간 하루에 몇 명이 가입했는지 평균값입니다.',
            good: '목표 1명 이상을 달성하면 지속 성장 중입니다.',
            bad: '0명이 계속되면 SNS 홍보를 즉시 시작하세요.'
        },
        weeklyGrowth: {
            title: '주간 성장률이란?',
            desc: '지난주 대비 이번주 가입자가 몇 % 증가했는지 보여줍니다.',
            good: '15% 이상이면 매우 빠른 성장입니다.',
            bad: '마이너스가 나오면 심각한 문제입니다. 즉시 대책이 필요합니다.'
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
                    <p className="text-sm text-content-muted mt-1">
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

                    {/* Sheets 내보내기 */}
                    <button
                        onClick={exportToSheets}
                        disabled={exporting || loading}
                        className="px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        title="Google Sheets로 내보내기"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.318 12.545H7.91v-1.909h3.41v1.91zm.545 3.274v-1.91H7.91v1.91h3.953zm0-6.549H7.91v1.91h3.953v-1.91zM4.636 0v24l2.455-2.455L9.545 24l2.455-2.455L14.455 24l2.454-2.455L19.364 24V0H4.636zm13.09 21.145H6.273V2.91h11.454v18.236z"/>
                        </svg>
                        {exporting ? '내보내는 중...' : 'Sheets 내보내기'}
                    </button>
                    {exportResult && (
                        <span className="text-xs text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                            ✅ {exportResult.label} 저장됨
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
                    {/* 목표 메모 표시 */}
                    {data.goalInfo.notes && (
                        <div className="card p-4 bg-blue-50 border border-blue-200">
                            <p className="text-xs font-semibold text-blue-700 mb-2">6월 목표</p>
                            <div className="flex flex-wrap gap-2">
                                {data.goalInfo.notes.split('·').map((item, i) => (
                                    <span key={i} className="text-xs px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-900 font-medium">
                                        {item.trim()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

            {/* 이달 달성 현황 */}
            <div className="card p-5">
                <h2 className="text-sm font-semibold text-content-primary mb-4">{selectedMonth}월 달성 현황</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: '가입자', current: metrics.currentUsers,    target: metrics.targets.users,     unit: '명' },
                        { label: '댓글',   current: metrics.currentComments, target: metrics.targets.comments,  unit: '개' },
                        { label: '반응',   current: metrics.currentReactions,target: metrics.targets.reactions, unit: '개' },
                        { label: '투표',   current: metrics.currentVotes,    target: metrics.targets.votes,     unit: '개' },
                    ].map(({ label, current, target, unit }) => {
                        const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
                        const lack = Math.max(target - current, 0)
                        const ok = current >= target
                        return (
                            <div key={label} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-content-muted">{label}</span>
                                    <span className="text-xs font-semibold text-content-primary">{pct}%</span>
                                </div>
                                <div className="w-full bg-surface-muted rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full transition-all ${ok ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-lg font-bold text-content-primary">{current.toLocaleString()}{unit}</span>
                                    <span className="text-xs text-content-muted">
                                        {ok ? `목표 달성` : `${lack.toLocaleString()}${unit} 부족`}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

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
            <div className="flex p-1 bg-surface-muted rounded-xl w-fit">
                {([1, 7, 30] as const).map(p => (
                    <button
                        key={p}
                        onClick={() => setSelectedPeriod(p)}
                        className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedPeriod === p
                                ? 'bg-white shadow text-content-primary'
                                : 'text-content-muted hover:text-content-primary'
                        }`}
                    >
                        {p === 1 ? '오늘' : p === 7 ? '이번주' : '이번달'}
                    </button>
                ))}
            </div>

            {(() => {
                const pKey = selectedPeriod === 1 ? 'd1' as const : selectedPeriod === 7 ? 'd7' as const : 'd30' as const
                const pStat = metrics.periodStats[pKey]
                const pageViews = selectedPeriod === 1 ? metrics.todayPageViews : selectedPeriod === 7 ? metrics.weeklyPageViews : metrics.monthlyPageViews
                const t = metrics.targets
                const issueTarget    = t.dailyIssues * selectedPeriod
                const shortformTarget = t.dailyShortformsPerPlatform * selectedPeriod
                const userTarget     = t.dailyNewUsers * selectedPeriod
                const pvTarget       = Math.round(t.pageviews / 30 * selectedPeriod)
                const commentTarget  = t.dailyComments * selectedPeriod
                const reactionTarget = t.dailyReactions * selectedPeriod
                const voteTarget     = 0

                const StatCard = ({ label, val, target, unit }: { label: string; val: number; target: number; unit: string }) => (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-xs text-slate-600 mb-2">{label}</p>
                        <div className="flex items-baseline gap-1">
                            <p className="text-3xl font-bold text-slate-900">{val.toLocaleString()}</p>
                            <p className="text-sm text-slate-500">{unit}</p>
                        </div>
                        {target > 0 && (
                            <p className="text-xs text-slate-400 mt-1">목표 {target.toLocaleString()}{unit}</p>
                        )}
                    </div>
                )

                return (
                    <>
                    {/* 콘텐츠 등록 */}
                    <div className="card p-5">
                        <h2 className="text-sm font-semibold text-content-primary mb-4">콘텐츠 등록</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="이슈 (승인)"  val={pStat.issues}              target={issueTarget}     unit="개" />
                            <StatCard label="인스타 숏폼 등록"  val={pStat.shortforms.instagram} target={shortformTarget} unit="개" />
                            <StatCard label="유튜브 숏폼 등록"  val={pStat.shortforms.youtube}   target={shortformTarget} unit="개" />
                            <StatCard label="틱톡 숏폼 등록"    val={pStat.shortforms.tiktok}    target={shortformTarget} unit="개" />
                        </div>
                    </div>

                    {/* 주요 지표 */}
                    <div className="card p-5">
                        <h2 className="text-sm font-semibold text-content-primary mb-4">주요 지표</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="가입자"   val={pStat.newUsers}  target={userTarget}     unit="명" />
                            <StatCard label="페이지뷰" val={pageViews}        target={pvTarget}        unit="" />
                            <StatCard label="댓글"     val={pStat.comments}  target={commentTarget}   unit="개" />
                            <StatCard label="반응"     val={pStat.reactions} target={reactionTarget}  unit="개" />
                            <StatCard label="투표"     val={pStat.votes}     target={voteTarget}      unit="개" />
                        </div>
                    </div>
                    </>
                )
            })()}

            {/* 유입 체크 */}
            {(() => {
                const pKey = selectedPeriod === 1 ? 'd1' as const : selectedPeriod === 7 ? 'd7' as const : 'd30' as const
                const src = metrics.visitorsBySource[pKey]
                return (
                    <div className="card p-5">
                        <h2 className="text-sm font-semibold text-content-primary mb-4">유입 체크</h2>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {[
                                { label: '인스타', val: src.instagram },
                                { label: '유튜브', val: src.youtube },
                                { label: '틱톡',   val: src.tiktok },
                                { label: 'X',      val: src.x },
                                { label: '스레드', val: src.threads },
                                { label: '검색',   val: src.organic },
                            ].map(({ label, val }) => (
                                <div key={label} className="p-3 bg-surface-subtle rounded-xl border border-border text-center">
                                    <p className="text-xs text-content-muted mb-1">{label}</p>
                                    <p className="text-2xl font-bold text-content-primary">{val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })()}
            </>}


            {selectedTab === 'plan' && <>
            {/* 📅 익월 목표 자동계산 (+20%) */}
            <div className="card p-6 border-l-4 border-l-emerald-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">익월 목표 자동계산</h2>
                            <p className="text-xs text-content-muted">이번 달 목표 기준 ×1.2로 다음달 목표 자동 제안</p>
                        </div>
                    </div>
                    {!nextMonthSuggestion && (
                        <button
                            onClick={fetchNextMonthSuggestion}
                            disabled={loadingNextMonth}
                            className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loadingNextMonth ? '계산 중...' : '목표 계산하기'}
                        </button>
                    )}
                </div>
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
