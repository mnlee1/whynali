/**
 * app/admin/page.tsx
 *
 * [관리자 대시보드]
 *
 * 이슈 대기, 토론 주제 대기, 세이프티 검토, 수집 현황 등
 * 운영 핵심 지표를 한눈에 확인할 수 있는 대시보드입니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ─── 타입 ────────────────────────────────────────────────

interface DashboardStats {
    issuesPending: number
    discussionsPending: number
    safetyPending: number
    newsTotal: number
    news24h: number
    communityTotal: number
    community24h: number
}

interface CandidateAlert {
    title: string
    count: number
    newsCount: number
    communityCount: number
}

interface RecentLog {
    id: string
    action: string
    target_type: string
    target_id: string | null
    admin_id: string | null
    created_at: string
}

interface ApiCostsSummary {
    naver: {
        today: number
        monthly: number
        cost: number
        limit: number
    }
    groq: {
        today: number
        monthly: number
        successes: number
        failures: number
    }
    perplexity: {
        today: number
        monthly: number
        calls: {
            today: number
            monthly: number
        }
        tokens: {
            today: {
                input: number
                output: number
                total: number
            }
            monthly: {
                input: number
                output: number
                total: number
            }
        }
        successes: number
        failures: number
    } | null
    total: {
        monthly: number
    }
}

// ─── 서브 컴포넌트 ────────────────────────────────────────

function StatCard({
    label,
    value,
    href,
    accent,
    loading,
}: {
    label: string
    value: number
    href: string
    accent?: 'yellow' | 'red' | 'blue' | 'green'
    loading?: boolean
}) {
    const accentClass = {
        yellow: 'border-yellow-300 bg-yellow-50',
        red: 'border-red-300 bg-red-50',
        blue: 'border-blue-200 bg-blue-50',
        green: 'border-green-200 bg-green-50',
    }[accent ?? 'blue']

    const valueClass = {
        yellow: 'text-yellow-700',
        red: 'text-red-600',
        blue: 'text-blue-700',
        green: 'text-green-700',
    }[accent ?? 'blue']

    return (
        <Link
            href={href}
            className={`block rounded-lg border p-5 hover:shadow-md transition-shadow ${accentClass}`}
        >
            <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
            {loading ? (
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
            ) : (
                <p className={`text-3xl font-bold ${valueClass}`}>{value.toLocaleString()}</p>
            )}
        </Link>
    )
}

const TARGET_TYPE_LABELS: Record<string, string> = {
    discussion_topic: '토론 주제',
    safety_rule: '금칙어',
    comment: '댓글',
    vote: '투표',
    issue: '이슈',
}

const ACTION_BADGE: Record<string, string> = {
    '승인': 'bg-green-100 text-green-700',
    '반려': 'bg-red-100 text-red-700',
    '복구': 'bg-gray-100 text-gray-600',
    '종료': 'bg-gray-200 text-gray-700',
    '수정': 'bg-blue-100 text-blue-700',
    '삭제': 'bg-red-100 text-red-700',
    '금칙어 추가': 'bg-orange-100 text-orange-700',
    '금칙어 삭제': 'bg-red-100 text-red-700',
    '숨김': 'bg-gray-100 text-gray-600',
}

// ─── 메인 컴포넌트 ────────────────────────────────────────

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [alerts, setAlerts] = useState<CandidateAlert[]>([])
    const [alertsDismissed, setAlertsDismissed] = useState(false)
    const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
    const [logsLoading, setLogsLoading] = useState(true)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [apiCosts, setApiCosts] = useState<ApiCostsSummary | null>(null)
    const [costsLoading, setCostsLoading] = useState(true)

    const fetchAll = async () => {
        console.log('[Admin Dashboard] fetchAll 시작')
        setStatsLoading(true)
        setLogsLoading(true)
        setCostsLoading(true)

        try {
            console.log('[Admin Dashboard] 핵심 API 호출 시작 (병렬 처리)')
            const [issuesRes, discussionsRes, safetyRes, collectionsRes, logsRes, apiUsageRes] =
                await Promise.all([
                    fetch('/api/admin/issues?approval_status=대기'),
                    fetch('/api/admin/discussions?status=대기'),
                    fetch('/api/admin/safety/pending'),
                    fetch('/api/admin/collections'),
                    fetch('/api/admin/logs?limit=8'),
                    fetch('/api/admin/api-usage'),
                ])

            console.log('[Admin Dashboard] 핵심 API 응답 받음')

            const [issuesData, discussionsData, safetyData, collectionsData, logsData, apiUsageData] =
                await Promise.all([
                    issuesRes.ok ? issuesRes.json() : null,
                    discussionsRes.ok ? discussionsRes.json() : null,
                    safetyRes.ok ? safetyRes.json() : null,
                    collectionsRes.ok ? collectionsRes.json() : null,
                    logsRes.ok ? logsRes.json() : null,
                    apiUsageRes.ok ? apiUsageRes.json() : null,
                ])

            const news24h = collectionsData
                ? Object.values(collectionsData.news?.last24h ?? {}).reduce((a: number, b) => a + (b as number), 0)
                : 0
            const community24h = collectionsData
                ? Object.values(collectionsData.community?.last24h ?? {}).reduce((a: number, b) => a + (b as number), 0)
                : 0

            setStats({
                issuesPending: issuesData?.total ?? 0,
                discussionsPending: discussionsData?.total ?? 0,
                safetyPending: safetyData?.total ?? 0,
                newsTotal: collectionsData?.news?.total ?? 0,
                news24h: news24h as number,
                communityTotal: collectionsData?.community?.total ?? 0,
                community24h: community24h as number,
            })

            setRecentLogs(logsData?.data ?? [])
            setApiCosts(apiUsageData)
            setLastRefreshedAt(new Date())
        } catch (error) {
            console.error('[Admin Dashboard] 데이터 로드 에러:', error)
        } finally {
            setStatsLoading(false)
            setLogsLoading(false)
            setCostsLoading(false)
        }

        fetch('/api/admin/candidates')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setAlerts(data?.alerts ?? [])
            })
            .catch(err => {
                console.error('[Admin Dashboard] Candidates 에러:', err)
            })
    }

    useEffect(() => {
        console.log('[Admin Dashboard] 컴포넌트 마운트, fetchAll 호출')
        fetchAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const fmt = (d: string) => {
        const date = new Date(d)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
                    <p className="text-sm text-gray-500 mt-0.5">운영 현황을 한눈에 확인합니다</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            갱신 {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchAll}
                        disabled={statsLoading}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 이슈 후보 알람 배너 */}
            {alerts.length > 0 && !alertsDismissed && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-800 mb-2">
                                이슈 후보 {alerts.length}건 — 검토 필요
                            </p>
                            <ul className="space-y-1">
                                {alerts.map((alert, i) => (
                                    <li key={i} className="text-sm text-amber-700">
                                        <span className="font-medium">{alert.title}</span>
                                        <span className="ml-2 text-amber-500 text-xs">
                                            최근 1시간 {alert.count}건 (뉴스 {alert.newsCount} + 커뮤니티 {alert.communityCount})
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button
                            onClick={() => setAlertsDismissed(true)}
                            className="text-amber-400 hover:text-amber-600 text-xs shrink-0"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}

            {/* 핵심 지표 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <StatCard
                    label="이슈 승인 대기"
                    value={stats?.issuesPending ?? 0}
                    href="/admin/issues"
                    accent="yellow"
                    loading={statsLoading}
                />
                <StatCard
                    label="토론 주제 대기"
                    value={stats?.discussionsPending ?? 0}
                    href="/admin/discussions"
                    accent="blue"
                    loading={statsLoading}
                />
                <StatCard
                    label="세이프티 검토 대기"
                    value={stats?.safetyPending ?? 0}
                    href="/admin/safety"
                    accent="red"
                    loading={statsLoading}
                />
                <StatCard
                    label="오늘 수집 (뉴스+커뮤니티)"
                    value={statsLoading ? 0 : (stats?.news24h ?? 0) + (stats?.community24h ?? 0)}
                    href="/admin/collections"
                    accent="green"
                    loading={statsLoading}
                />
            </div>

            {/* AI 시스템 현황 */}
            <div className="mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold text-gray-800">AI 시스템 현황</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                기준일: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <span className="text-xs text-gray-400">실시간 모니터링</span>
                    </div>

                    {costsLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : !apiCosts ? (
                        <p className="text-sm text-gray-400 py-4 text-center">데이터를 불러올 수 없습니다</p>
                    ) : (
                        <div className="space-y-4">
                            {/* Groq AI */}
                            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                                        <div>
                                            <p className="text-base font-semibold text-gray-900">Groq AI</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Llama 3.1 8B Instant</p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-semibold bg-green-500 text-white rounded-full">
                                        사용 중
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white/60 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">
                                            오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                        </p>
                                        <p className="text-2xl font-bold text-gray-900">{apiCosts.groq?.today || 0}<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-green-600 mt-1">$0.00</p>
                                    </div>
                                    <div className="bg-white/60 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">
                                            이번 달 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                        </p>
                                        <p className="text-2xl font-bold text-gray-900">{apiCosts.groq?.monthly || 0}<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-green-600 mt-1">$0.00 (무료)</p>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-3">
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">카테고리 자동 분류</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">중복 이슈 체크</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">커뮤니티 급증 검증</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">뉴스-이슈 연결 검증</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">커뮤니티 글 매칭</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">토론 주제 생성</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                        <span className="text-gray-700 font-medium">투표 생성</span>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">활성</span>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-green-200">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">성공률</span>
                                        <span className="text-lg font-bold text-green-600">
                                            {apiCosts.groq?.monthly > 0 
                                                ? Math.round((apiCosts.groq.successes / apiCosts.groq.monthly) * 100)
                                                : 100}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Perplexity AI (사용 시에만 표시) */}
                            {apiCosts.perplexity && (
                                <div className="p-5 bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg border border-purple-200">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse" />
                                            <div>
                                                <p className="text-base font-semibold text-gray-900">Perplexity AI</p>
                                                <p className="text-xs text-gray-500 mt-0.5">Sonar Model</p>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 text-xs font-semibold bg-purple-500 text-white rounded-full">
                                            사용 중
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-white/60 rounded-lg p-3">
                                            <p className="text-xs text-gray-500 mb-1">
                                                오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                            </p>
                                            <p className="text-2xl font-bold text-gray-900">{apiCosts.perplexity.calls.today}<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
                                            <p className="text-xs font-semibold text-purple-600 mt-1">
                                                ${apiCosts.perplexity.today.toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="bg-white/60 rounded-lg p-3">
                                            <p className="text-xs text-gray-500 mb-1">
                                                이번 달 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                            </p>
                                            <p className="text-2xl font-bold text-gray-900">{apiCosts.perplexity.calls.monthly}<span className="text-sm font-normal text-gray-500 ml-1">회</span></p>
                                            <p className="text-xs font-semibold text-purple-600 mt-1">
                                                ${apiCosts.perplexity.monthly.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-3">
                                        <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                            <span className="text-gray-700 font-medium">뉴스 그루핑</span>
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">활성</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs bg-white/60 rounded px-3 py-2">
                                            <span className="text-gray-700 font-medium">이슈 후보 검증</span>
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">활성</span>
                                        </div>
                                    </div>

                                    <div className="bg-white/60 rounded-lg p-3 mb-3">
                                        <p className="text-xs font-medium text-purple-700 mb-2">
                                            토큰 사용량 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                        </p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <p className="text-xs text-gray-500">입력</p>
                                                <p className="text-sm font-bold text-gray-900">{(apiCosts.perplexity.tokens.monthly.input / 1000).toFixed(1)}K</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">출력</p>
                                                <p className="text-sm font-bold text-gray-900">{(apiCosts.perplexity.tokens.monthly.output / 1000).toFixed(1)}K</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">전체</p>
                                                <p className="text-sm font-bold text-purple-600">{(apiCosts.perplexity.tokens.monthly.total / 1000).toFixed(1)}K</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-purple-200">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">성공률</span>
                                            <span className="text-lg font-bold text-purple-600">
                                                {apiCosts.perplexity.calls.monthly > 0 
                                                    ? Math.round((apiCosts.perplexity.successes / apiCosts.perplexity.calls.monthly) * 100)
                                                    : 100}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 전체 요약 */}
                            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border-2 border-gray-300">
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">AI 시스템 총 비용</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })} 누적
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold text-gray-900">
                                        ${apiCosts.total.monthly.toFixed(2)}
                                    </p>
                                    {apiCosts.total.monthly === 0 ? (
                                        <p className="text-sm text-green-600 font-semibold mt-1">모두 무료</p>
                                    ) : (
                                        <p className="text-sm text-gray-600 mt-1">
                                            ≈ ₩{Math.round(apiCosts.total.monthly * 1300).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 수집 현황 요약 + 최근 로그 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 수집 현황 요약 */}
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-gray-800">수집 현황</h2>
                        <Link href="/admin/collections" className="text-xs text-gray-400 hover:text-gray-600">
                            상세 보기 →
                        </Link>
                    </div>

                    {statsLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-gray-100">
                                <div>
                                    <p className="text-sm font-medium text-gray-700">뉴스</p>
                                    <p className="text-xs text-gray-400 mt-0.5">30분 주기 수집</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-gray-900">{stats?.newsTotal.toLocaleString() ?? 0}</p>
                                    <p className="text-xs text-green-600">+{stats?.news24h ?? 0} (24h)</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <div>
                                    <p className="text-sm font-medium text-gray-700">커뮤니티</p>
                                    <p className="text-xs text-gray-400 mt-0.5">3분 주기 수집</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-gray-900">{stats?.communityTotal.toLocaleString() ?? 0}</p>
                                    <p className="text-xs text-green-600">+{stats?.community24h ?? 0} (24h)</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 최근 운영 로그 */}
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-gray-800">최근 운영 로그</h2>
                        <Link href="/admin/logs" className="text-xs text-gray-400 hover:text-gray-600">
                            전체 보기 →
                        </Link>
                    </div>

                    {logsLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : recentLogs.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">로그가 없습니다</p>
                    ) : (
                        <ul className="space-y-2">
                            {recentLogs.map((log) => (
                                <li key={log.id} className="flex items-center gap-2 py-1.5">
                                    <span className={`shrink-0 px-2 py-0.5 text-xs rounded font-medium ${ACTION_BADGE[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                                        {log.action}
                                    </span>
                                    <span className="text-xs text-gray-500 truncate flex-1">
                                        {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                        {log.target_id && <span className="text-gray-300 ml-1">#{log.target_id.slice(0, 6)}</span>}
                                    </span>
                                    <span className="text-xs text-gray-300 shrink-0">{fmt(log.created_at)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
