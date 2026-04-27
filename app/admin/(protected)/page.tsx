/**
 * app/admin/page.tsx
 *
 * [관리자 대시보드]
 *
 * 이슈 대기, 토론 주제 대기, 세이프티 검토, 수집 현황 등
 * 운영 핵심 지표를 한눈에 확인할 수 있는 대시보드입니다.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── 타입 ────────────────────────────────────────────────

interface DashboardStats {
    issuesPending: number
    discussionsPending: number
    safetyPending: number
    votesPending: number
}

interface RecentLog {
    id: string
    action: string
    target_type: string
    target_id: string | null
    admin_id: string | null
    details: string | null
    created_at: string
}

interface AiKeyStatus {
    isBlocked: boolean
    blockedUntil: string | null
    failCount: number
    blockReason: 'rate_limit' | 'credit_depleted'
}

interface ApiCostsSummary {
    naver: {
        today: number
        monthly: number
    }
    groq: {
        today: number
        monthly: number
        keyStatus: AiKeyStatus | null
    }
    claude: {
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
        keyStatus: AiKeyStatus | null
    }
    total: {
        monthly: number
    }
}

interface Stats24h {
    warnings: Array<{
        type: string
        severity: 'critical' | 'warning'
        message: string
        value: number
    }>
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
            className={`block rounded-xl border p-5 hover:shadow-md transition-shadow ${accentClass}`}
        >
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-content-muted">{label}</p>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-content-muted" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
            </div>
            {loading ? (
                <div className="h-8 w-12 bg-surface-muted rounded animate-pulse" />
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
    '댓글 공개': 'bg-green-100 text-green-700',
    '댓글 삭제': 'bg-red-100 text-red-700',
    '투표 생성': 'bg-blue-100 text-blue-700',
    '투표 승인': 'bg-green-100 text-green-700',
    '투표 반려': 'bg-red-100 text-red-700',
    '투표 수동 종료': 'bg-gray-200 text-gray-700',
    '투표 삭제': 'bg-red-100 text-red-700',
}

// ─── 메인 컴포넌트 ────────────────────────────────────────

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
    const [logsLoading, setLogsLoading] = useState(true)
    const [apiCosts, setApiCosts] = useState<ApiCostsSummary | null>(null)
    const [costsLoading, setCostsLoading] = useState(true)
    const [stats24h, setStats24h] = useState<Stats24h | null>(null)
    const [stats24hLoading, setStats24hLoading] = useState(true)
    const [actionTooltip, setActionTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

    const [showAiFeatures, setShowAiFeatures] = useState(false)

    const fetchAll = useCallback(async () => {
        console.log('[Admin Dashboard] fetchAll 시작')
        setStatsLoading(true)
        setLogsLoading(true)
        setCostsLoading(true)
        setStats24hLoading(true)

        try {
            console.log('[Admin Dashboard] 핵심 API 호출 시작 (병렬 처리)')
            const [issuesRes, discussionsRes, safetyRes, votesRes, logsRes, apiUsageRes, stats24hRes] =
                await Promise.all([
                    fetch('/api/admin/issues?approval_status=대기'),
                    fetch('/api/admin/discussions?approval_status=대기'),
                    fetch('/api/admin/reports?status=대기&limit=1'),
                    fetch('/api/admin/votes?approval_status=대기&limit=1'),
                    fetch('/api/admin/logs?limit=8'),
                    fetch('/api/admin/api-usage'),
                    fetch('/api/admin/stats-24h'),
                ])

            console.log('[Admin Dashboard] 핵심 API 응답 받음')

            const [issuesData, discussionsData, safetyData, votesData, logsData, apiUsageData, stats24hData] =
                await Promise.all([
                    issuesRes.ok ? issuesRes.json() : null,
                    discussionsRes.ok ? discussionsRes.json() : null,
                    safetyRes.ok ? safetyRes.json() : null,
                    votesRes.ok ? votesRes.json() : null,
                    logsRes.ok ? logsRes.json() : null,
                    apiUsageRes.ok ? apiUsageRes.json() : null,
                    stats24hRes.ok ? stats24hRes.json() : null,
                ])

            setStats({
                issuesPending: issuesData?.total ?? 0,
                discussionsPending: discussionsData?.total ?? 0,
                safetyPending: safetyData?.total ?? 0,
                votesPending: votesData?.total ?? 0,
            })

            setRecentLogs(logsData?.data ?? [])
            setApiCosts(apiUsageData)
            setStats24h(stats24hData)
        } catch (error) {
            console.error('[Admin Dashboard] 데이터 로드 에러:', error)
        } finally {
            setStatsLoading(false)
            setLogsLoading(false)
            setCostsLoading(false)
            setStats24hLoading(false)
        }
    }, [])

    // 마운트 시 1회 + 탭 재활성화 시 자동 갱신 (불필요한 API 호출 없음)
    useEffect(() => {
        console.log('[Admin Dashboard] 컴포넌트 마운트, fetchAll 호출')
        fetchAll()
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchAll()
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [fetchAll])

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
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-content-primary">대시보드</h1>
            </div>

            {/* 수집 이상 경고 배너 */}
            {!stats24hLoading && stats24h && stats24h.warnings.length > 0 && (
                <div className="mb-4 space-y-2">
                    {stats24h.warnings.map((warning, idx) => (
                        <div
                            key={idx}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${
                                warning.severity === 'critical'
                                    ? 'bg-red-50 border-red-300'
                                    : 'bg-yellow-50 border-yellow-300'
                            }`}
                        >
                            <span
                                className={`shrink-0 px-2 py-0.5 text-xs font-bold rounded ${
                                    warning.severity === 'critical'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-yellow-500 text-white'
                                }`}
                            >
                                {warning.severity === 'critical' ? '치명' : '경고'}
                            </span>
                            <p className={`text-sm flex-1 ${warning.severity === 'critical' ? 'text-red-800' : 'text-yellow-800'}`}>
                                {warning.message}
                            </p>
                            <Link
                                href="/admin/collections"
                                className={`shrink-0 text-xs font-medium hover:underline ${
                                    warning.severity === 'critical' ? 'text-red-600' : 'text-yellow-700'
                                }`}
                            >
                                수집 현황 확인 →
                            </Link>
                        </div>
                    ))}
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
                    label="투표 승인 대기"
                    value={stats?.votesPending ?? 0}
                    href="/admin/votes"
                    accent="green"
                    loading={statsLoading}
                />
            </div>

            {/* AI 시스템 현황 */}
            <div className="mb-6">
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-semibold text-content-primary">AI 시스템 현황</h2>
                        </div>
                        <span className="text-sm text-content-muted">기준일: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>

                    {costsLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-32 bg-surface-muted rounded animate-pulse" />
                            ))}
                        </div>
                    ) : !apiCosts ? (
                        <p className="text-sm text-content-muted py-4 text-center">데이터를 불러올 수 없습니다</p>
                    ) : (
                        <div className="space-y-4">

                            {/* Claude AI + Groq AI 나란히 */}
                            <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-4">

                            {/* Claude AI (1순위) */}
                            <div className="p-5 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <p className="text-base font-semibold text-content-primary">Claude AI</p>
                                        <p className="text-xs text-content-secondary mt-0.5">claude-sonnet-4-6</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href="https://console.anthropic.com/settings/billing"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1 text-xs font-semibold border border-orange-500 text-orange-600 rounded-full hover:bg-orange-50 transition-colors"
                                        >
                                            Anthropic 콘솔 →
                                        </a>
                                        <span className="px-2.5 py-1 text-xs font-semibold bg-orange-500 text-white rounded-full">
                                            1순위
                                        </span>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="bg-white/60 rounded-xl p-3 flex flex-col justify-between">
                                        <p className="text-sm text-content-secondary mb-1">
                                            오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                        </p>
                                        <div>
                                            <p className="text-2xl font-bold text-content-primary">{apiCosts.claude.calls.today}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                            <p className="text-sm font-semibold text-orange-600 mt-1">${apiCosts.claude.today.toFixed(4)}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-orange-200">
                                    {(() => {
                                        const keyStatus = apiCosts.claude.keyStatus
                                        const isCreditDepleted = keyStatus?.blockReason === 'credit_depleted'
                                        const blockedUntil = keyStatus?.blockedUntil
                                            ? new Date(keyStatus.blockedUntil)
                                            : null
                                        const secsLeft = blockedUntil
                                            ? Math.max(0, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000))
                                            : 0
                                        const label = !keyStatus
                                            ? '정상'
                                            : isCreditDepleted
                                            ? '크레딧 소진'
                                            : `Rate Limit (${secsLeft > 0 ? `${secsLeft}초 후 해제` : '곧 해제'})`
                                        return (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-content-secondary">AI 상태</span>
                                                <span className={`flex items-center gap-1.5 text-sm font-semibold ${
                                                    keyStatus ? 'text-red-600' : 'text-green-600'
                                                }`}>
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        keyStatus ? 'bg-red-500' : 'bg-green-500'
                                                    }`} />
                                                    {label}
                                                </span>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Groq AI (2순위) */}
                            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 flex flex-col justify-between">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div>
                                            <p className="text-base font-semibold text-content-primary">Groq AI</p>
                                <p className="text-sm text-content-secondary mt-0.5">Llama 3.1 8B Instant</p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-semibold bg-green-500 text-white rounded-full">
                                        2순위 (폴백)
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white/60 rounded-xl p-3 flex flex-col justify-between">
                                        <p className="text-sm text-content-secondary mb-1">
                                            오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                        </p>
                                        <div>
                                            <p className="text-2xl font-bold text-content-primary">{apiCosts.groq?.today || 0}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        </div>
                                    </div>
                                    <div className="bg-white/60 rounded-xl p-3 flex flex-col justify-between">
                                        <div>
                                            <p className="text-sm text-content-secondary">이번 달</p>
                                            <p className="text-xs text-content-muted mt-0.5">{new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-content-primary">{apiCosts.groq?.monthly || 0}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-green-200">
                                    {(() => {
                                        const keyStatus = apiCosts.groq?.keyStatus
                                        const blockedUntil = keyStatus?.blockedUntil
                                            ? new Date(keyStatus.blockedUntil)
                                            : null
                                        const secsLeft = blockedUntil
                                            ? Math.max(0, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000))
                                            : 0
                                        return (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-content-secondary">AI 상태</span>
                                                <span className={`flex items-center gap-1.5 text-sm font-semibold ${
                                                    keyStatus ? 'text-red-600' : 'text-green-600'
                                                }`}>
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        keyStatus ? 'bg-red-500' : 'bg-green-500'
                                                    }`} />
                                                    {keyStatus
                                                        ? `Rate Limit (${secsLeft > 0 ? `${secsLeft}초 후 해제` : '곧 해제'})`
                                                        : '정상'}
                                                </span>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>

                            </div> {/* grid 끝 */}

                            {/* 활성 AI 기능 아코디언 */}
                            <div className="border border-border rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowAiFeatures((v) => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-surface-subtle hover:bg-surface-muted transition-colors text-left"
                                >
                                    <span className="text-sm font-semibold text-content-secondary">활성 AI 기능</span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={`text-content-muted transition-transform duration-200 ${showAiFeatures ? 'rotate-180' : ''}`}
                                    >
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                {showAiFeatures && (
                                    <div className="p-4 grid grid-cols-2 gap-1.5 border-t border-border">
                                        {[
                                            { label: '이슈 진위 판단', desc: '카테고리·키워드·제목 추출 포함', model: 'Claude', schedule: '10분' },
                                            { label: '중복 이슈 체크', desc: '기존 이슈와 AI 비교', model: 'Groq', schedule: '10분' },
                                            { label: '상위 이슈 연결', desc: '후속·파생 이슈 자동 연결', model: 'Groq', schedule: '10분' },
                                            { label: '뉴스·커뮤니티 필터링', desc: '관련 콘텐츠 선별 + 최종 제목', model: 'Claude', schedule: '10분' },
                                            { label: '타임라인 분류', desc: '전개·파생 단계 분류', model: 'Groq', schedule: '10분 / 매시 30분' },
                                            { label: '토론 주제 생성', desc: '승인 이슈 대상', model: 'Groq', schedule: '매일' },
                                            { label: '투표 생성', desc: '승인 이슈 대상', model: 'Groq', schedule: '매일' },
                                            { label: '숏폼 해시태그 생성', desc: '업로드 시 자동 생성', model: 'Groq', schedule: '수동' },
                                            { label: '숏폼 이미지 검증', desc: '생성된 이미지 적합성 판별', model: 'Gemini', schedule: '매일' },
                                        ].map((feature) => (
                                            <div key={feature.label} className="flex items-start text-sm bg-surface rounded px-2.5 py-1.5 border border-border-muted">
                                                <div className="min-w-0">
                                                    <p className="text-content-primary font-medium">{feature.label}</p>
                                                    <p className="text-content-muted text-xs mt-0.5">{feature.desc}</p>
                                                    <p className="text-xs mt-0.5 text-content-muted">
                                                        <span className="font-medium text-content-secondary">{feature.model}</span>
                                                        <span className="mx-1">·</span>
                                                        {feature.schedule}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>

            {/* 최근 운영 로그 */}
            <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-content-primary">최근 운영 로그</h2>
                    <Link href="/admin/logs" className="text-sm text-content-muted hover:text-content-secondary">
                        전체 보기 →
                    </Link>
                </div>

                {logsLoading ? (
                    <div className="p-5 space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-8 bg-surface-muted rounded animate-pulse" />
                        ))}
                    </div>
                ) : recentLogs.length === 0 ? (
                    <p className="text-sm text-content-muted py-8 text-center">로그가 없습니다</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-surface-subtle">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">시간</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">액션</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">대상</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">내용</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">관리자</th>
                                </tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-border">
                                {recentLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                            {fmt(log.created_at)}
                                        </td>
                                        <td className="px-4 py-3 w-44 max-w-[11rem]">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block max-w-full truncate cursor-default ${ACTION_BADGE[log.action] ?? 'bg-surface-muted text-content-secondary'}`}
                                                onMouseEnter={(e) => {
                                                    const el = e.currentTarget
                                                    if (el.scrollWidth > el.clientWidth) {
                                                        const rect = el.getBoundingClientRect()
                                                        setActionTooltip({
                                                            text: log.action,
                                                            x: rect.left + rect.width / 2,
                                                            y: rect.top - 6,
                                                        })
                                                    }
                                                }}
                                                onMouseLeave={() => setActionTooltip(null)}
                                            >
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                            {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary max-w-xs">
                                            {log.details ? (
                                                <span className="line-clamp-1">{log.details}</span>
                                            ) : (
                                                <span className="text-border-strong">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                            {log.admin_id ? log.admin_id.split('@')[0] : '시스템'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {actionTooltip && (
                <div
                    className="fixed z-50 px-2 py-1 text-xs text-white bg-gray-800 rounded pointer-events-none -translate-x-1/2 -translate-y-full max-w-[14rem] break-keep leading-relaxed"
                    style={{ left: actionTooltip.x, top: actionTooltip.y }}
                >
                    {actionTooltip.text}
                </div>
            )}
        </div>
    )
}
