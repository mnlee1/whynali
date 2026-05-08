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
import { TrendingUp, Target, Users, MessageCircle, ThumbsUp, CheckSquare, AlertCircle, Calendar, TrendingDown, HelpCircle, Zap, Activity } from 'lucide-react'

interface KPIMetrics {
    currentUsers: number
    currentActiveIssues: number
    currentComments: number
    currentIssueComments: number
    currentDiscussionOpinions: number
    currentReactions: number
    currentVotes: number
    
    // 방문자 지표
    weeklyPageViews: number
    weeklyUniqueVisitors: number
    monthlyPageViews: number
    monthlyUniqueVisitors: number
    visitorsBySource: {
        threads: number
        instagram: number
        twitter: number
        direct: number
        organic: number
        other: number
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
    dailyNewUsers: number
    dailyComments: number
    dailyReactions: number
    weeklyGrowthRate: number
    usersLastWeek: number
    userProgress: number
    commentProgress: number
    reactionProgress: number
    voteProgress: number
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
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [showHelp, setShowHelp] = useState<string | null>(null)
    
    // 월 선택
    const now = new Date()
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

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
                setLastUpdated(new Date())
            }
        } catch (error) {
            console.error('[KPI Dashboard] 데이터 로드 에러:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData(selectedYear, selectedMonth)
    }, [selectedYear, selectedMonth])

    // 월 변경 핸들러
    const handleMonthChange = (year: number, month: number) => {
        setSelectedYear(year)
        setSelectedMonth(month)
    }

    // 이전/다음 월 이동
    const handlePrevMonth = () => {
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
            title: '활성 이슈란?',
            desc: '현재 공개되어 사람들이 볼 수 있는 이슈 개수입니다. 콘텐츠가 많아야 활동이 생깁니다.',
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

    const { metrics, weeklyProgress } = data
    const currentWeek = weeklyProgress.find(w => w.isCurrent) || weeklyProgress.find(w => !w.isPast) || weeklyProgress[0]

    // 진행 상태 계산
    const overallProgress = (
        metrics.userProgress +
        metrics.commentProgress +
        metrics.reactionProgress +
        metrics.voteProgress
    ) / 4

    const isOnTrack = currentWeek ? metrics.currentUsers >= currentWeek.targetUsers : false

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-content-primary">KPI 리포트</h1>
                        <p className="text-sm text-content-muted mt-1">
                            {data?.goalInfo 
                                ? `목표 기간: ${data.goalInfo.periodStart} - ${data.goalInfo.periodEnd}`
                                : '목표 기간 정보 없음'}
                        </p>
                    </div>
                    
                    {/* 월 선택 컨트롤 */}
                    <div className="flex items-center gap-2 ml-4">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                            title="이전 월"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        
                        <div className="px-4 py-2 bg-surface-subtle border border-border rounded-lg min-w-[140px] text-center">
                            <span className="text-lg font-semibold text-content-primary">
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
                </div>
                
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-sm text-content-muted">
                            마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
                        </span>
                    )}
                    <button
                        onClick={() => fetchData(selectedYear, selectedMonth)}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm font-medium bg-surface-subtle hover:bg-surface-muted border border-border rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? '새로고침 중...' : '새로고침'}
                    </button>
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
                            <p className="text-sm text-blue-900">
                                <span className="font-semibold">목표 설명:</span> {data.goalInfo.notes}
                            </p>
                        </div>
                    )}

            {/* 📊 전체 진행 상태 배너 */}
            <div className={`card p-6 border-2 ${isOnTrack ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isOnTrack ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        {isOnTrack ? (
                            <TrendingUp className="w-6 h-6 text-green-600" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-yellow-600" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h2 className={`text-lg font-bold mb-1 ${isOnTrack ? 'text-green-800' : 'text-yellow-800'}`}>
                            {isOnTrack ? '🎉 목표 달성 중입니다!' : '⚠️ 목표 달성 주의가 필요합니다'}
                        </h2>
                        <p className={`text-sm mb-3 ${isOnTrack ? 'text-green-700' : 'text-yellow-700'}`}>
                            {isOnTrack
                                ? `현재 ${currentWeek?.week || 1}주차 목표인 ${currentWeek?.targetUsers || 0}명을 달성했습니다. 이대로 계속 진행하세요!`
                                : `현재 ${currentWeek?.week || 1}주차 목표 ${currentWeek?.targetUsers || 0}명에 ${(currentWeek?.targetUsers || 0) - metrics.currentUsers}명 부족합니다. 추가 액션이 필요합니다.`
                            }
                        </p>
                        <div className="flex items-center gap-6 text-sm">
                            <div>
                                <span className={isOnTrack ? 'text-green-700' : 'text-yellow-700'}>
                                    전체 진행률: <span className="font-bold">{overallProgress.toFixed(1)}%</span>
                                </span>
                            </div>
                            <div>
                                <span className={isOnTrack ? 'text-green-700' : 'text-yellow-700'}>
                                    주간 성장률: <span className="font-bold">{metrics.weeklyGrowthRate.toFixed(1)}%</span>
                                </span>
                            </div>
                            <div>
                                <span className={isOnTrack ? 'text-green-700' : 'text-yellow-700'}>
                                    D-Day: <span className="font-bold">{Math.max(0, Math.ceil((new Date('2026-06-30').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))}일</span> 남음
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 📈 카테고리 1: 성장 지표 */}
            <div className="card p-6 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">성장 지표</h2>
                            <p className="text-xs text-content-muted">서비스가 얼마나 커지고 있는지 보여줍니다</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowHelp(showHelp === 'growth' ? null : 'growth')}
                        className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                    >
                        <HelpCircle className="w-5 h-5 text-content-muted" />
                    </button>
                </div>

                {showHelp === 'growth' && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-900 font-medium mb-2">💡 성장 지표를 보는 방법</p>
                        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                            <li>가입자 수: 숫자가 꾸준히 올라가야 합니다 (주 15% 이상 증가가 좋음)</li>
                            <li>활성 이슈: 최소 10개 이상 유지해야 사람들이 볼 콘텐츠가 충분합니다</li>
                            <li>주간 성장률: 매주 15% 이상이면 매우 건강한 성장입니다</li>
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 가입자 수 */}
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-blue-600" />
                                <p className="text-sm font-medium text-blue-900">가입자 수</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'users' ? null : 'users')}
                                className="hover:bg-blue-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-blue-600" />
                            </button>
                        </div>
                        {showHelp === 'users' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-blue-200">
                                <p className="text-xs font-semibold text-blue-900 mb-1">{helpContent.users.title}</p>
                                <p className="text-xs text-blue-800 mb-2">{helpContent.users.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.users.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.users.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-blue-900">
                                {metrics.currentUsers}
                            </p>
                            <p className="text-lg text-blue-700">/ {metrics.targets.users}명</p>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 mb-2">
                            <div
                                className="h-2 rounded-full bg-blue-500 transition-all"
                                style={{ width: `${Math.min(metrics.userProgress, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                metrics.userProgress >= 100 ? 'bg-green-200 text-green-800' :
                                metrics.userProgress >= 50 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.userProgress.toFixed(0)}% 달성
                            </span>
                            <span className="text-blue-700">
                                {metrics.currentUsers >= currentWeek.targetUsers ? '✅ 이번주 목표 달성' : '⏳ 추가 필요'}
                            </span>
                        </div>
                    </div>

                    {/* 활성 이슈 */}
                    <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-green-600" />
                                <p className="text-sm font-medium text-green-900">활성 이슈</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'activeIssues' ? null : 'activeIssues')}
                                className="hover:bg-green-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-green-600" />
                            </button>
                        </div>
                        {showHelp === 'activeIssues' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-green-200">
                                <p className="text-xs font-semibold text-green-900 mb-1">{helpContent.activeIssues.title}</p>
                                <p className="text-xs text-green-800 mb-2">{helpContent.activeIssues.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.activeIssues.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.activeIssues.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-green-900">
                                {metrics.currentActiveIssues}
                            </p>
                            <p className="text-lg text-green-700">/ {metrics.targets.activeIssues}개</p>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 mb-2">
                            <div
                                className="h-2 rounded-full bg-green-500 transition-all"
                                style={{ width: `${Math.min((metrics.currentActiveIssues / metrics.targets.activeIssues) * 100, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                metrics.currentActiveIssues >= metrics.targets.activeIssues ? 'bg-green-200 text-green-800' :
                                metrics.currentActiveIssues >= 10 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {((metrics.currentActiveIssues / metrics.targets.activeIssues) * 100).toFixed(0)}% 달성
                            </span>
                            <span className="text-green-700">
                                {metrics.currentActiveIssues >= 10 ? '✅ 충분함' : '⚠️ 이슈 추가 필요'}
                            </span>
                        </div>
                    </div>

                    {/* 주간 성장률 */}
                    <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-600" />
                                <p className="text-sm font-medium text-purple-900">주간 성장률</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'weeklyGrowth' ? null : 'weeklyGrowth')}
                                className="hover:bg-purple-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-purple-600" />
                            </button>
                        </div>
                        {showHelp === 'weeklyGrowth' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-purple-200">
                                <p className="text-xs font-semibold text-purple-900 mb-1">{helpContent.weeklyGrowth.title}</p>
                                <p className="text-xs text-purple-800 mb-2">{helpContent.weeklyGrowth.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.weeklyGrowth.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.weeklyGrowth.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-purple-900">
                                {metrics.weeklyGrowthRate.toFixed(1)}%
                            </p>
                            <p className="text-lg text-purple-700">/ 주</p>
                        </div>
                        <div className="text-xs text-purple-700 space-y-1">
                            <p>지난주: {metrics.usersLastWeek}명</p>
                            <p>이번주: {metrics.currentUsers}명 (+{metrics.currentUsers - metrics.usersLastWeek}명)</p>
                        </div>
                        <div className="mt-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                metrics.weeklyGrowthRate >= 25 ? 'bg-green-200 text-green-800' :
                                metrics.weeklyGrowthRate >= 15 ? 'bg-yellow-200 text-yellow-800' :
                                metrics.weeklyGrowthRate > 0 ? 'bg-orange-200 text-orange-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.weeklyGrowthRate >= 15 ? '🚀 빠른 성장' : metrics.weeklyGrowthRate > 0 ? '⚠️ 성장 더디움' : '🚨 성장 정체'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🌐 카테고리: 방문자 및 유입 경로 (재미나이 제안 1번) */}
            <div className="card p-6 border-l-4 border-l-cyan-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">방문자 및 유입 경로</h2>
                            <p className="text-xs text-content-muted">어디서 얼마나 많은 사용자가 방문했는지 확인하세요</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl border border-cyan-200">
                        <p className="text-sm font-medium text-cyan-900 mb-3">주간 방문자 (최근 7일)</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-cyan-700">페이지뷰</span>
                                <span className="text-lg font-bold text-cyan-900">{metrics.weeklyPageViews.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-cyan-700">순방문자</span>
                                <span className="text-lg font-bold text-cyan-900">{metrics.weeklyUniqueVisitors.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                        <p className="text-sm font-medium text-blue-900 mb-3">월간 방문자 (최근 30일)</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-blue-700">페이지뷰</span>
                                <span className="text-lg font-bold text-blue-900">{metrics.monthlyPageViews.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-blue-700">순방문자</span>
                                <span className="text-lg font-bold text-blue-900">{metrics.monthlyUniqueVisitors.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl border border-teal-200">
                    <p className="text-sm font-medium text-teal-900 mb-3">유입 경로별 방문자 (최근 7일)</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">스레드</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.threads}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">인스타그램</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.instagram}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">트위터</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.twitter}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">직접 방문</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.direct}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">검색</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.organic}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-xs text-teal-700 mb-1">기타</p>
                            <p className="text-xl font-bold text-teal-900">{metrics.visitorsBySource.other}</p>
                        </div>
                    </div>
                    <p className="text-xs text-teal-700 mt-3">💡 가장 효과적인 채널에 마케팅을 집중하세요</p>
                </div>
            </div>

            {/* 📊 카테고리: 전환율 분석 (재미나이 제안 2번) */}
            <div className="card p-6 border-l-4 border-l-orange-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <Target className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">전환율 분석</h2>
                            <p className="text-xs text-content-muted">방문자가 실제 활동으로 이어지는 비율 (최근 7일)</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                        <p className="text-xs text-orange-700 mb-2">가입 전환율</p>
                        <p className="text-2xl font-bold text-orange-900 mb-1">{metrics.conversionRates.signupRate.toFixed(2)}%</p>
                        <p className="text-xs text-orange-600">방문 → 가입</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200">
                        <p className="text-xs text-red-700 mb-2">투표 전환율</p>
                        <p className="text-2xl font-bold text-red-900 mb-1">{metrics.conversionRates.voteRate.toFixed(2)}%</p>
                        <p className="text-xs text-red-600">방문 → 투표</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200">
                        <p className="text-xs text-amber-700 mb-2">댓글 전환율</p>
                        <p className="text-2xl font-bold text-amber-900 mb-1">{metrics.conversionRates.commentRate.toFixed(2)}%</p>
                        <p className="text-xs text-amber-600">방문 → 댓글</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
                        <p className="text-xs text-yellow-700 mb-2">반응 전환율</p>
                        <p className="text-2xl font-bold text-yellow-900 mb-1">{metrics.conversionRates.reactionRate.toFixed(2)}%</p>
                        <p className="text-xs text-yellow-600">방문 → 반응</p>
                    </div>
                </div>

                <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-900 font-medium mb-2">💡 전환율 개선 팁</p>
                    <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                        <li>가입 전환율 3% 이상: 랜딩 페이지와 가입 플로우가 효과적입니다</li>
                        <li>투표 전환율 2% 이상: 이슈가 충분히 흥미롭고 투표 UI가 직관적입니다</li>
                        <li>댓글 전환율 1% 이상: 사용자들이 의견을 남기기 편한 환경입니다</li>
                        <li>전환율이 낮다면: 첫 화면에서 행동 유도 버튼을 강조하세요</li>
                    </ul>
                </div>
            </div>

            {/* 🎯 카테고리: 이슈 품질 지표 (재미나이 제안 3번) */}
            <div className="card p-6 border-l-4 border-l-pink-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                            <CheckSquare className="w-5 h-5 text-pink-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">이슈 소싱 품질</h2>
                            <p className="text-xs text-content-muted">이슈당 평균 참여도와 인기 카테고리</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl border border-pink-200">
                        <p className="text-xs text-pink-700 mb-2">이슈당 평균 투표</p>
                        <p className="text-2xl font-bold text-pink-900">{metrics.issueQuality.avgVotesPerIssue.toFixed(1)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl border border-rose-200">
                        <p className="text-xs text-rose-700 mb-2">이슈당 평균 댓글</p>
                        <p className="text-2xl font-bold text-rose-900">{metrics.issueQuality.avgCommentsPerIssue.toFixed(1)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-fuchsia-50 to-fuchsia-100 rounded-xl border border-fuchsia-200">
                        <p className="text-xs text-fuchsia-700 mb-2">이슈당 평균 반응</p>
                        <p className="text-2xl font-bold text-fuchsia-900">{metrics.issueQuality.avgReactionsPerIssue.toFixed(1)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                        <p className="text-xs text-purple-700 mb-2">가장 인기있는 카테고리</p>
                        <p className="text-xl font-bold text-purple-900">{metrics.issueQuality.topCategory || '데이터 없음'}</p>
                    </div>
                </div>

                <div className="p-4 bg-pink-50 border border-pink-200 rounded-lg">
                    <p className="text-sm text-pink-900 font-medium mb-2">💡 이슈 품질 기준</p>
                    <ul className="text-sm text-pink-800 space-y-1 list-disc list-inside">
                        <li>이슈당 평균 투표 10개 이상: 사용자들이 적극적으로 의견을 표현하고 있습니다</li>
                        <li>이슈당 평균 댓글 4개 이상: 이슈가 토론을 유발하고 있습니다</li>
                        <li>이슈당 평균 반응 15개 이상: 콘텐츠가 공감을 얻고 있습니다</li>
                        <li>인기 카테고리에 집중: 사용자들이 관심있는 주제로 더 많은 이슈를 만드세요</li>
                    </ul>
                </div>
            </div>

            {/* 💬 카테고리 2: 참여 지표 */}
            <div className="card p-6 border-l-4 border-l-indigo-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <MessageCircle className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">참여 지표</h2>
                            <p className="text-xs text-content-muted">사용자들이 얼마나 적극적으로 활동하는지 보여줍니다</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowHelp(showHelp === 'engagement' ? null : 'engagement')}
                        className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                    >
                        <HelpCircle className="w-5 h-5 text-content-muted" />
                    </button>
                </div>

                {showHelp === 'engagement' && (
                    <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <p className="text-sm text-indigo-900 font-medium mb-2">💡 참여 지표를 보는 방법</p>
                        <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
                            <li>댓글 수: 이슈당 평균 4개 이상이면 활발한 토론이 일어나고 있습니다</li>
                            <li>반응 수: 사용자들이 콘텐츠에 공감하고 있는지 확인하세요</li>
                            <li>투표 참여: 사용자들이 의견을 적극적으로 표현하는지 보여줍니다</li>
                            <li>참여율: 가입자 중 실제로 활동하는 비율입니다 (높을수록 좋음)</li>
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 누적 댓글 */}
                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl border border-indigo-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-indigo-600" />
                                <p className="text-sm font-medium text-indigo-900">누적 댓글</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'comments' ? null : 'comments')}
                                className="hover:bg-indigo-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-indigo-600" />
                            </button>
                        </div>
                        {showHelp === 'comments' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-indigo-200">
                                <p className="text-xs font-semibold text-indigo-900 mb-1">{helpContent.comments.title}</p>
                                <p className="text-xs text-indigo-800 mb-2">{helpContent.comments.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.comments.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.comments.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-indigo-900">
                                {metrics.currentComments}
                            </p>
                            <p className="text-lg text-indigo-700">/ {metrics.targets.comments}개</p>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 mb-2">
                            <div
                                className="h-2 rounded-full bg-indigo-500 transition-all"
                                style={{ width: `${Math.min(metrics.commentProgress, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                metrics.commentProgress >= 100 ? 'bg-green-200 text-green-800' :
                                metrics.commentProgress >= 50 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.commentProgress.toFixed(0)}% 달성
                            </span>
                        </div>
                        <div className="mt-2 text-xs text-indigo-700 space-y-0.5">
                            <p>이슈 댓글: {metrics.currentIssueComments}개</p>
                            <p>토론 의견: {metrics.currentDiscussionOpinions}개</p>
                        </div>
                    </div>

                    {/* 누적 반응 */}
                    <div className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl border border-pink-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <ThumbsUp className="w-4 h-4 text-pink-600" />
                                <p className="text-sm font-medium text-pink-900">누적 반응</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'reactions' ? null : 'reactions')}
                                className="hover:bg-pink-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-pink-600" />
                            </button>
                        </div>
                        {showHelp === 'reactions' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-pink-200">
                                <p className="text-xs font-semibold text-pink-900 mb-1">{helpContent.reactions.title}</p>
                                <p className="text-xs text-pink-800 mb-2">{helpContent.reactions.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.reactions.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.reactions.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-pink-900">
                                {metrics.currentReactions}
                            </p>
                            <p className="text-lg text-pink-700">/ {metrics.targets.reactions}개</p>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 mb-2">
                            <div
                                className="h-2 rounded-full bg-pink-500 transition-all"
                                style={{ width: `${Math.min(metrics.reactionProgress, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                metrics.reactionProgress >= 100 ? 'bg-green-200 text-green-800' :
                                metrics.reactionProgress >= 50 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.reactionProgress.toFixed(0)}% 달성
                            </span>
                        </div>
                    </div>

                    {/* 투표 참여 */}
                    <div className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl border border-teal-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-teal-600" />
                                <p className="text-sm font-medium text-teal-900">투표 참여</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'votes' ? null : 'votes')}
                                className="hover:bg-teal-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-teal-600" />
                            </button>
                        </div>
                        {showHelp === 'votes' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-teal-200">
                                <p className="text-xs font-semibold text-teal-900 mb-1">{helpContent.votes.title}</p>
                                <p className="text-xs text-teal-800 mb-2">{helpContent.votes.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.votes.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.votes.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-teal-900">
                                {metrics.currentVotes}
                            </p>
                            <p className="text-lg text-teal-700">/ {metrics.targets.votes}회</p>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 mb-2">
                            <div
                                className="h-2 rounded-full bg-teal-500 transition-all"
                                style={{ width: `${Math.min(metrics.voteProgress, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold px-2 py-0.5 rounded-full ${
                                metrics.voteProgress >= 100 ? 'bg-green-200 text-green-800' :
                                metrics.voteProgress >= 50 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.voteProgress.toFixed(0)}% 달성
                            </span>
                        </div>
                    </div>
                </div>

                {/* 참여율 상세 */}
                <div className="mt-4 p-4 bg-surface-subtle rounded-xl">
                    <p className="text-sm font-medium text-content-primary mb-3">📊 참여율 상세 (가입자 대비 활동 비율)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-content-muted">댓글 참여율</p>
                                <button
                                    onClick={() => setShowHelp(showHelp === 'commentParticipation' ? null : 'commentParticipation')}
                                    className="hover:bg-surface-muted p-1 rounded"
                                    title="도움말 보기"
                                >
                                    <HelpCircle className="w-4 h-4 text-content-muted" />
                                </button>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-content-primary">
                                    {metrics.commentParticipation.toFixed(1)}%
                                </p>
                                <p className="text-xs text-content-muted">/ {metrics.targets.commentParticipation}%</p>
                            </div>
                            {showHelp === 'commentParticipation' && (
                                <div className="mt-2 p-3 bg-white rounded-lg border border-indigo-200 shadow-lg">
                                    <p className="text-xs font-semibold text-indigo-900 mb-1">{helpContent.commentParticipation.title}</p>
                                    <p className="text-xs text-indigo-800 mb-2">{helpContent.commentParticipation.desc}</p>
                                    <p className="text-xs text-green-700 mb-1">✅ {helpContent.commentParticipation.good}</p>
                                    <p className="text-xs text-red-700">❌ {helpContent.commentParticipation.bad}</p>
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-content-muted">반응 참여율</p>
                                <button
                                    onClick={() => setShowHelp(showHelp === 'reactionParticipation' ? null : 'reactionParticipation')}
                                    className="hover:bg-surface-muted p-1 rounded"
                                    title="도움말 보기"
                                >
                                    <HelpCircle className="w-4 h-4 text-content-muted" />
                                </button>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-content-primary">
                                    {metrics.reactionParticipation.toFixed(1)}%
                                </p>
                                <p className="text-xs text-content-muted">/ {metrics.targets.reactionParticipation}%</p>
                            </div>
                            {showHelp === 'reactionParticipation' && (
                                <div className="mt-2 p-3 bg-white rounded-lg border border-pink-200 shadow-lg">
                                    <p className="text-xs font-semibold text-pink-900 mb-1">{helpContent.reactionParticipation.title}</p>
                                    <p className="text-xs text-pink-800 mb-2">{helpContent.reactionParticipation.desc}</p>
                                    <p className="text-xs text-green-700 mb-1">✅ {helpContent.reactionParticipation.good}</p>
                                    <p className="text-xs text-red-700">❌ {helpContent.reactionParticipation.bad}</p>
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-content-muted">투표 참여율</p>
                                <button
                                    onClick={() => setShowHelp(showHelp === 'voteParticipation' ? null : 'voteParticipation')}
                                    className="hover:bg-surface-muted p-1 rounded"
                                    title="도움말 보기"
                                >
                                    <HelpCircle className="w-4 h-4 text-content-muted" />
                                </button>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-bold text-content-primary">
                                    {metrics.voteParticipation.toFixed(1)}%
                                </p>
                                <p className="text-xs text-content-muted">/ {metrics.targets.voteParticipation}%</p>
                            </div>
                            {showHelp === 'voteParticipation' && (
                                <div className="mt-2 p-3 bg-white rounded-lg border border-teal-200 shadow-lg">
                                    <p className="text-xs font-semibold text-teal-900 mb-1">{helpContent.voteParticipation.title}</p>
                                    <p className="text-xs text-teal-800 mb-2">{helpContent.voteParticipation.desc}</p>
                                    <p className="text-xs text-green-700 mb-1">✅ {helpContent.voteParticipation.good}</p>
                                    <p className="text-xs text-red-700">❌ {helpContent.voteParticipation.bad}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ⚡ 카테고리 3: 일일 활동 */}
            <div className="card p-6 border-l-4 border-l-orange-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <Zap className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">일일 활동</h2>
                            <p className="text-xs text-content-muted">최근 7일간 하루 평균 활동량입니다</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowHelp(showHelp === 'daily' ? null : 'daily')}
                        className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                    >
                        <HelpCircle className="w-5 h-5 text-content-muted" />
                    </button>
                </div>

                {showHelp === 'daily' && (
                    <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="text-sm text-orange-900 font-medium mb-2">💡 일일 활동을 보는 방법</p>
                        <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                            <li>일평균 신규 가입: 1명 이상이면 지속 성장 중입니다</li>
                            <li>일평균 댓글: 2개 이상이면 활발한 토론이 일어나고 있습니다</li>
                            <li>일평균 반응: 4개 이상이면 콘텐츠가 공감을 얻고 있습니다</li>
                            <li>모든 지표가 0에 가까우면 즉시 대책이 필요합니다</li>
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 일평균 신규 가입 */}
                    <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-orange-600" />
                                <p className="text-sm font-medium text-orange-900">일평균 신규 가입</p>
                            </div>
                            <button
                                onClick={() => setShowHelp(showHelp === 'dailyNewUsers' ? null : 'dailyNewUsers')}
                                className="hover:bg-orange-200 p-1 rounded"
                            >
                                <HelpCircle className="w-4 h-4 text-orange-600" />
                            </button>
                        </div>
                        {showHelp === 'dailyNewUsers' && (
                            <div className="mb-3 p-3 bg-white rounded-lg border border-orange-200">
                                <p className="text-xs font-semibold text-orange-900 mb-1">{helpContent.dailyNewUsers.title}</p>
                                <p className="text-xs text-orange-800 mb-2">{helpContent.dailyNewUsers.desc}</p>
                                <p className="text-xs text-green-700 mb-1">✅ {helpContent.dailyNewUsers.good}</p>
                                <p className="text-xs text-red-700">❌ {helpContent.dailyNewUsers.bad}</p>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-orange-900">
                                {metrics.dailyNewUsers.toFixed(1)}
                            </p>
                            <p className="text-lg text-orange-700">/ {metrics.targets.dailyNewUsers}명</p>
                        </div>
                        <p className="text-xs text-orange-700">최근 7일 기준</p>
                        <div className="mt-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                metrics.dailyNewUsers >= metrics.targets.dailyNewUsers ? 'bg-green-200 text-green-800' :
                                metrics.dailyNewUsers >= 0.5 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.dailyNewUsers >= metrics.targets.dailyNewUsers ? '✅ 목표 달성' : metrics.dailyNewUsers > 0 ? '⚠️ 목표 미달' : '🚨 성장 정체'}
                            </span>
                        </div>
                    </div>

                    {/* 일평균 댓글 */}
                    <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
                        <div className="flex items-center gap-2 mb-2">
                            <MessageCircle className="w-4 h-4 text-yellow-600" />
                            <p className="text-sm font-medium text-yellow-900">일평균 댓글</p>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-yellow-900">
                                {metrics.dailyComments.toFixed(1)}
                            </p>
                            <p className="text-lg text-yellow-700">/ {metrics.targets.dailyComments}개</p>
                        </div>
                        <p className="text-xs text-yellow-700">최근 7일 기준</p>
                        <div className="mt-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                metrics.dailyComments >= metrics.targets.dailyComments ? 'bg-green-200 text-green-800' :
                                metrics.dailyComments >= 1 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.dailyComments >= metrics.targets.dailyComments ? '✅ 목표 달성' : metrics.dailyComments > 0 ? '⚠️ 목표 미달' : '🚨 참여 저조'}
                            </span>
                        </div>
                    </div>

                    {/* 일평균 반응 */}
                    <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                            <ThumbsUp className="w-4 h-4 text-red-600" />
                            <p className="text-sm font-medium text-red-900">일평균 반응</p>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <p className="text-3xl font-bold text-red-900">
                                {metrics.dailyReactions.toFixed(1)}
                            </p>
                            <p className="text-lg text-red-700">/ {metrics.targets.dailyReactions}개</p>
                        </div>
                        <p className="text-xs text-red-700">최근 7일 기준</p>
                        <div className="mt-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                metrics.dailyReactions >= metrics.targets.dailyReactions ? 'bg-green-200 text-green-800' :
                                metrics.dailyReactions >= 2 ? 'bg-yellow-200 text-yellow-800' :
                                'bg-red-200 text-red-800'
                            }`}>
                                {metrics.dailyReactions >= metrics.targets.dailyReactions ? '✅ 목표 달성' : metrics.dailyReactions > 0 ? '⚠️ 목표 미달' : '🚨 참여 저조'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 📅 주차별 마일스톤 */}
            <div className="card p-6 border-l-4 border-l-violet-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-content-primary">주차별 마일스톤</h2>
                            <p className="text-xs text-content-muted">6월 4주간 주차별 목표와 달성 현황입니다</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowHelp(showHelp === 'milestones' ? null : 'milestones')}
                        className="p-2 hover:bg-surface-muted rounded-lg transition-colors"
                    >
                        <HelpCircle className="w-5 h-5 text-content-muted" />
                    </button>
                </div>

                {showHelp === 'milestones' && (
                    <div className="mb-4 p-4 bg-violet-50 border border-violet-200 rounded-lg">
                        <p className="text-sm text-violet-900 font-medium mb-2">💡 주차별 마일스톤 보는 방법</p>
                        <ul className="text-sm text-violet-800 space-y-1 list-disc list-inside">
                            <li><span className="font-semibold text-blue-700">진행중</span>: 현재 진행 중인 주차입니다</li>
                            <li><span className="font-semibold text-green-700">달성</span>: 목표를 달성한 주차입니다 (가입자와 댓글 모두 목표 이상)</li>
                            <li><span className="font-semibold text-red-700">미달</span>: 목표를 달성하지 못한 주차입니다</li>
                            <li><span className="font-semibold text-gray-700">대기</span>: 아직 시작하지 않은 주차입니다</li>
                            <li>매주 월요일에 지난주 달성 여부를 확인하세요</li>
                        </ul>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">주차</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">기간</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">목표 가입자</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">현재 가입자</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">목표 댓글</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">현재 댓글</th>
                                <th className="px-4 py-3 text-center text-sm font-medium text-content-muted">상태</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {weeklyProgress.map((week) => (
                                <tr
                                    key={week.week}
                                    className={`${
                                        week.isCurrent ? 'bg-blue-50' :
                                        week.isPast && week.userAchieved && week.commentAchieved ? 'bg-green-50' :
                                        week.isPast ? 'bg-red-50' :
                                        'hover:bg-surface-subtle'
                                    }`}
                                >
                                    <td className="px-4 py-3 text-sm font-medium text-content-primary">
                                        {week.week}주차
                                        {week.isCurrent && (
                                            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                현재
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-secondary">
                                        {week.startDate.substring(5)} ~ {week.endDate.substring(5)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-primary text-right font-mono">
                                        {week.targetUsers}명
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-secondary text-right font-mono">
                                        <span className={week.userAchieved ? 'text-green-600 font-semibold' : ''}>
                                            {week.currentUsers}명
                                        </span>
                                        {week.isCurrent && !week.userAchieved && (
                                            <span className="ml-1 text-xs text-red-600">
                                                (-{week.targetUsers - week.currentUsers})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-primary text-right font-mono">
                                        {week.targetComments}개
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-secondary text-right font-mono">
                                        <span className={week.commentAchieved ? 'text-green-600 font-semibold' : ''}>
                                            {week.currentComments}개
                                        </span>
                                        {week.isCurrent && !week.commentAchieved && (
                                            <span className="ml-1 text-xs text-red-600">
                                                (-{week.targetComments - week.currentComments})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {week.isCurrent ? (
                                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                진행중
                                            </span>
                                        ) : week.isPast ? (
                                            week.userAchieved && week.commentAchieved ? (
                                                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                                                    ✅ 달성
                                                </span>
                                            ) : (
                                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                                                    ❌ 미달
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                                                대기
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 🎯 필요 액션 */}
            <div className="card p-6 border-l-4 border-l-amber-500">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                        <Target className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-content-primary">지금 해야 할 일</h2>
                        <p className="text-xs text-content-muted">현재 상황에 맞는 구체적인 액션 아이템입니다</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {metrics.currentActiveIssues === 0 && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border-l-4 border-l-red-500">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-900 mb-1">🚨 긴급: 활성 이슈 0개</p>
                                <p className="text-sm text-red-800 mb-2">
                                    콘텐츠가 없으면 사용자가 방문해도 볼 것이 없습니다.
                                </p>
                                <div className="text-sm text-red-800 space-y-1">
                                    <p className="font-medium">해야 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>대기 중인 이슈 승인하기</li>
                                        <li>뉴스에서 화제 이슈 직접 등록하기</li>
                                        <li>최소 10개 이상 유지 권장</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {metrics.currentActiveIssues > 0 && metrics.currentActiveIssues < 10 && (
                        <div className="flex items-start gap-3 p-4 bg-yellow-50 rounded-lg border-l-4 border-l-yellow-500">
                            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-yellow-900 mb-1">⚠️ 주의: 이슈 부족 ({metrics.currentActiveIssues}개)</p>
                                <p className="text-sm text-yellow-800 mb-2">
                                    콘텐츠가 10개 미만이면 사용자가 금방 다 보고 나갑니다.
                                </p>
                                <div className="text-sm text-yellow-800 space-y-1">
                                    <p className="font-medium">해야 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>주 2-3개씩 꾸준히 이슈 등록하기</li>
                                        <li>화력 높은 이슈 우선 승인하기</li>
                                        <li>목표: 최소 15개 이상</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {metrics.dailyNewUsers < metrics.targets.dailyNewUsers && (
                        <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg border-l-4 border-l-orange-500">
                            <TrendingDown className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-orange-900 mb-1">
                                    📉 일평균 신규 가입 목표 미달 ({metrics.dailyNewUsers.toFixed(1)}명/일)
                                </p>
                                <p className="text-sm text-orange-800 mb-2">
                                    목표: {metrics.targets.dailyNewUsers}명/일 | 부족: {(metrics.targets.dailyNewUsers - metrics.dailyNewUsers).toFixed(1)}명
                                </p>
                                <div className="text-sm text-orange-800 space-y-1">
                                    <p className="font-medium">해야 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>트위터/인스타 운영 시작 (docs/88 참고)</li>
                                        <li>카드뉴스 자동 발행 (docs/87 참고)</li>
                                        <li>지인 초대 (30명 목표)</li>
                                        <li>화력 높은 이슈 SNS 공유</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {metrics.commentParticipation < metrics.targets.commentParticipation && (
                        <div className="flex items-start gap-3 p-4 bg-indigo-50 rounded-lg border-l-4 border-l-indigo-500">
                            <MessageCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-indigo-900 mb-1">
                                    💬 댓글 참여율 낮음 ({metrics.commentParticipation.toFixed(1)}%)
                                </p>
                                <p className="text-sm text-indigo-800 mb-2">
                                    목표: {metrics.targets.commentParticipation}% | 부족: {(metrics.targets.commentParticipation - metrics.commentParticipation).toFixed(1)}%p
                                </p>
                                <div className="text-sm text-indigo-800 space-y-1">
                                    <p className="font-medium">해야 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>댓글 입력창 UI 개선 (더 눈에 띄게)</li>
                                        <li>베스트 댓글 이벤트 진행</li>
                                        <li>댓글 작성 유도 문구 추가</li>
                                        <li>운영자가 먼저 댓글 남기기</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isOnTrack && currentWeek && (
                        <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg border-l-4 border-l-purple-500">
                            <AlertCircle className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-purple-900 mb-1">
                                    🎯 주차별 목표 미달성 ({currentWeek.week}주차)
                                </p>
                                <p className="text-sm text-purple-800 mb-2">
                                    현재 {metrics.currentUsers}명 / 목표 {currentWeek.targetUsers}명 (부족: {currentWeek.targetUsers - metrics.currentUsers}명)
                                </p>
                                <div className="text-sm text-purple-800 space-y-1">
                                    <p className="font-medium">해야 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>위의 모든 액션 아이템 즉시 실행</li>
                                        <li>팀 회의 소집 (전략 재검토)</li>
                                        <li>예비 예산 투입 검토 (SNS 광고, 이벤트)</li>
                                        <li>목표 조정 논의</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {metrics.currentActiveIssues >= 10 && isOnTrack && metrics.dailyNewUsers >= metrics.targets.dailyNewUsers && metrics.commentParticipation >= metrics.targets.commentParticipation * 0.8 && (
                        <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border-l-4 border-l-green-500">
                            <TrendingUp className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-green-900 mb-1">
                                    🎉 축하합니다! 모든 지표가 목표를 달성하고 있습니다
                                </p>
                                <p className="text-sm text-green-800 mb-2">
                                    현재 페이스를 유지하면 6월 말 목표를 무리 없이 달성할 수 있습니다.
                                </p>
                                <div className="text-sm text-green-800 space-y-1">
                                    <p className="font-medium">계속 할 일:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>트위터/인스타 꾸준히 운영하기</li>
                                        <li>주 2-3개 이슈 등록 유지하기</li>
                                        <li>사용자 댓글/반응에 빠르게 응답하기</li>
                                        <li>매주 월요일 KPI 점검하기</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 재미나이 제안: 바이럴 트리거 액션 */}
                    {metrics.weeklyUniqueVisitors > 50 && metrics.conversionRates.voteRate < 2 && (
                        <div className="flex items-start gap-3 p-4 bg-pink-50 rounded-lg border-l-4 border-l-pink-500">
                            <Zap className="w-5 h-5 text-pink-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-pink-900 mb-1">
                                    🔥 바이럴 기회: 방문은 많지만 투표율 낮음
                                </p>
                                <p className="text-sm text-pink-800 mb-2">
                                    주간 방문자 {metrics.weeklyUniqueVisitors}명인데 투표 전환율이 {metrics.conversionRates.voteRate.toFixed(2)}%로 낮습니다.
                                </p>
                                <div className="text-sm text-pink-800 space-y-1">
                                    <p className="font-medium">바이럴 트리거 액션:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>인기 이슈에 "지금 투표하세요!" 강조 배너 추가</li>
                                        <li>투표하면 결과를 즉시 공유하도록 유도 (SNS 공유 버튼)</li>
                                        <li>투표 후 인센티브 제공 (뱃지, 포인트, 이벤트 응모권)</li>
                                        <li>투표 진행률 실시간 표시로 참여 유도</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 재미나이 제안: A/B 테스트 추천 */}
                    {metrics.issueQuality.topCategory && metrics.weeklyUniqueVisitors > 30 && (
                        <div className="flex items-start gap-3 p-4 bg-cyan-50 rounded-lg border-l-4 border-l-cyan-500">
                            <Activity className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-cyan-900 mb-1">
                                    🧪 A/B 테스트 추천: "{metrics.issueQuality.topCategory}" 카테고리 집중
                                </p>
                                <p className="text-sm text-cyan-800 mb-2">
                                    가장 인기있는 카테고리는 "{metrics.issueQuality.topCategory}"입니다. 이 카테고리로 더 많은 유입을 테스트해보세요.
                                </p>
                                <div className="text-sm text-cyan-800 space-y-1">
                                    <p className="font-medium">A/B 테스트 아이디어:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>SNS 광고: "{metrics.issueQuality.topCategory}" 주제 vs 일반 홍보</li>
                                        <li>랜딩페이지: 인기 카테고리 먼저 보여주기 vs 최신순</li>
                                        <li>카드뉴스: "{metrics.issueQuality.topCategory}" 이슈만 vs 종합</li>
                                        <li>UTM 태그로 유입 경로별 전환율 비교 분석</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 유입 경로 최적화 제안 */}
                    {Object.values(metrics.visitorsBySource).some(v => v > 0) && (
                        <div className="flex items-start gap-3 p-4 bg-teal-50 rounded-lg border-l-4 border-l-teal-500">
                            <TrendingUp className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-teal-900 mb-1">
                                    📈 유입 경로 최적화 전략
                                </p>
                                <p className="text-sm text-teal-800 mb-2">
                                    가장 효과적인 채널: {
                                        Object.entries(metrics.visitorsBySource)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([channel, count]) => `${channel} (${count}명)`)
                                            .slice(0, 2)
                                            .join(', ')
                                    }
                                </p>
                                <div className="text-sm text-teal-800 space-y-1">
                                    <p className="font-medium">최적화 액션:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>가장 많은 유입이 발생한 채널에 마케팅 집중</li>
                                        <li>각 채널별 최적 발행 시간대 분석</li>
                                        <li>효과 낮은 채널은 콘텐츠 형식 변경 (이미지/영상/텍스트)</li>
                                        <li>UTM 파라미터로 캠페인별 ROI 측정</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 📚 참고 문서 */}
            <div className="card p-6 bg-gradient-to-r from-slate-50 to-slate-100">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                        <HelpCircle className="w-4 h-4 text-slate-700" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">도움이 필요하신가요?</h3>
                </div>
                <div className="text-sm text-slate-700 space-y-3">
                    <div>
                        <p className="font-semibold text-slate-900 mb-2">📊 KPI 이해 및 운영</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">docs/80_KPI_계획_및_운영_가이드.md</code> - 전체 계획 및 측정 방법</li>
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">docs/84_6월_KPI_목표_확정.md</code> - 6월 목표 상세 설명 및 전략</li>
                        </ul>
                    </div>
                    
                    <div>
                        <p className="font-semibold text-slate-900 mb-2">🎯 매월 목표 설정하기</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">docs/90_KPI_목표_설정_가이드.md</code> - 매월 목표 설정 방법 (필독)</li>
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">supabase/migrations/TEMPLATE_kpi_goals.sql</code> - 목표 설정 SQL 템플릿</li>
                        </ul>
                        <p className="text-xs text-slate-600 mt-2 ml-2">
                            💡 매월 25일경 다음 달 목표를 설정하세요. 템플릿을 복사해서 값만 수정하면 됩니다.
                        </p>
                    </div>
                    
                    <div>
                        <p className="font-semibold text-slate-900 mb-2">🚀 성장 전략 실행</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">docs/87_카드뉴스_파이프라인_사용_가이드.md</code> - 콘텐츠 자동화</li>
                            <li><code className="px-2 py-0.5 bg-slate-200 rounded">docs/88_Meta_앱_설정_가이드.md</code> - 인스타그램 연동</li>
                        </ul>
                    </div>
                </div>
            </div>
            </>
            )}
        </div>
    )
}
