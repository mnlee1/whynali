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
    votesPending: number
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
    }
    groq: {
        today: number
        monthly: number
        successes: number
        failures: number
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
        successes: number
        failures: number
    }
    total: {
        monthly: number
    }
}

interface Stats24h {
    collection: {
        news: {
            total: number
            bySource: Record<string, { total: number; linked: number }>
        }
        community: {
            total: number
            bySite: Record<string, { total: number; linked: number }>
        }
    }
    issues: {
        created: number
        pending: number
        approved: number
        rejected: number
        merged: number
    }
    linking: {
        news: {
            linked: number
            unlinked: number
            rate: number
        }
        community: {
            linked: number
            unlinked: number
            rate: number
        }
    }
    warnings: Array<{
        type: string
        severity: 'critical' | 'warning'
        message: string
        value: number
    }>
    timestamp: string
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
            <p className="text-xs font-medium text-content-muted mb-2">{label}</p>
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

    const fetchAll = async () => {
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
                    fetch('/api/admin/discussions?status=대기'),
                    fetch('/api/admin/safety/pending'),
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
            <div className="mb-6">
                <h1 className="text-xl font-bold text-content-primary">대시보드</h1>
                <p className="text-sm text-content-secondary mt-0.5">운영 현황을 한눈에 확인합니다</p>
            </div>

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

            {/* 24시간 파이프라인 현황 */}
            <div className="mb-6">
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold text-content-primary">최근 24시간 파이프라인</h2>
                            <p className="text-xs text-content-secondary mt-0.5">
                                수집된 데이터가 이슈로 얼마나 연결됐는지 확인합니다
                            </p>
                        </div>
                    </div>

                    {stats24hLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-24 bg-surface-muted rounded animate-pulse" />
                            ))}
                        </div>
                    ) : !stats24h ? (
                        <p className="text-sm text-content-muted py-4 text-center">데이터를 불러올 수 없습니다</p>
                    ) : (
                        <div className="space-y-4">
                            {/* 경고 배너 */}
                            {stats24h.warnings.length > 0 && (
                                <div className="space-y-2">
                                    {stats24h.warnings.map((warning, idx) => (
                                        <div
                                            key={idx}
                                            className={`p-3 rounded-lg border flex items-center gap-2 ${
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
                                            <p className={`text-sm ${warning.severity === 'critical' ? 'text-red-800' : 'text-yellow-800'}`}>
                                                {warning.message}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 수집 현황 */}
                            <div className="rounded-xl border border-border-muted overflow-hidden">
                                <div className="px-4 py-2.5 bg-surface-subtle border-b border-border-muted">
                                    <p className="text-xs font-semibold text-content-primary uppercase tracking-wide">수집 현황</p>
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-border-muted">
                                    {/* 커뮤니티 */}
                                    <div className="p-4">
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className="text-2xl font-bold text-content-primary">
                                                {stats24h.collection.community.total.toLocaleString()}
                                            </span>
                                            <span className="text-xs text-content-secondary">건 수집</span>
                                            <span className="ml-auto text-xs font-medium text-green-600">
                                                {stats24h.linking.community.linked}건 연결
                                            </span>
                                        </div>
                                        <p className="text-xs font-medium text-content-secondary mb-2">커뮤니티 · 채널별</p>
                                        {Object.keys(stats24h.collection.community.bySite).length > 0 ? (
                                            <div className="space-y-1.5">
                                                {Object.entries(stats24h.collection.community.bySite)
                                                    .sort((a, b) => b[1].total - a[1].total)
                                                    .map(([site, data]) => (
                                                        <div key={site} className="flex items-center justify-between text-xs">
                                                            <span className="text-content-secondary truncate">{site}</span>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="text-content-muted">{data.total}건</span>
                                                                {data.linked > 0 && (
                                                                    <span className="text-green-600 font-medium">{data.linked} 연결</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-content-muted">수집 없음</p>
                                        )}
                                        {stats24h.linking.community.unlinked > 0 && (
                                            <p className="mt-3 text-xs text-content-muted border-t border-border-muted pt-2">
                                                미연결 {stats24h.linking.community.unlinked}건 — 버스트 감지 미달·AI 검증 실패·관련 뉴스 없음 등
                                            </p>
                                        )}
                                    </div>

                                    {/* 뉴스 */}
                                    <div className="p-4">
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className="text-2xl font-bold text-content-primary">
                                                {stats24h.collection.news.total.toLocaleString()}
                                            </span>
                                            <span className="text-xs text-content-secondary">건 수집</span>
                                            <span className="ml-auto text-xs font-medium text-green-600">
                                                {stats24h.linking.news.linked}건 연결
                                            </span>
                                        </div>
                                        {stats24h.linking.news.unlinked > 0 && (
                                            <p className="mt-3 text-xs text-content-muted border-t border-border-muted pt-2">
                                                미연결 {stats24h.linking.news.unlinked}건 — 이슈 키워드와 매칭되지 않음
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 이슈 생성 결과 */}
                            <div className="rounded-xl border border-border-muted overflow-hidden">
                                <div className="px-4 py-2.5 bg-surface-subtle border-b border-border-muted flex items-center justify-between">
                                    <p className="text-xs font-semibold text-content-primary uppercase tracking-wide">이슈 생성 결과</p>
                                    <span className="text-xs text-content-secondary">신규 {stats24h.issues.created}건</span>
                                </div>
                                <div className="p-4">
                                    {stats24h.issues.created === 0 ? (
                                        <p className="text-sm text-content-muted text-center py-2">24시간 내 생성된 이슈 없음</p>
                                    ) : (
                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="rounded-lg bg-yellow-50 border border-yellow-100 p-3 text-center">
                                                <p className="text-xs text-yellow-700 mb-1">승인 대기</p>
                                                <p className="text-xl font-bold text-yellow-700">{stats24h.issues.pending}</p>
                                            </div>
                                            <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
                                                <p className="text-xs text-green-700 mb-1">승인됨</p>
                                                <p className="text-xl font-bold text-green-700">{stats24h.issues.approved}</p>
                                            </div>
                                            <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                                                <p className="text-xs text-red-600 mb-1">반려됨</p>
                                                <p className="text-xl font-bold text-red-600">{stats24h.issues.rejected}</p>
                                            </div>
                                            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
                                                <p className="text-xs text-gray-500 mb-1">기존에 병합</p>
                                                <p className="text-xl font-bold text-gray-600">{stats24h.issues.merged}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 타임스탬프 */}
                            <p className="text-xs text-content-muted text-right">
                                기준 {new Date(stats24h.timestamp).toLocaleString('ko-KR')}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* AI 시스템 현황 */}
            <div className="mb-6">
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold text-content-primary">AI 시스템 현황</h2>
                            <p className="text-xs text-content-secondary mt-0.5">
                                기준일: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <span className="text-xs text-content-muted">실시간 모니터링</span>
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
                            {/* AI 활성 기능 */}
                            <div className="p-4 bg-surface-subtle rounded-xl border border-border">
                                <p className="text-xs font-semibold text-content-secondary mb-2.5">활성 AI 기능</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { label: '이슈 진위 판단', desc: '카테고리·키워드·제목 추출 포함' },
                                        { label: '중복 이슈 체크', desc: '기존 이슈와 AI 비교' },
                                        { label: '뉴스·커뮤니티 필터링', desc: '관련 콘텐츠 선별 + 최종 제목' },
                                        { label: '토론 주제 생성', desc: '승인 이슈 대상 (매일)' },
                                        { label: '투표 생성', desc: '승인 이슈 대상 (매일)' },
                                    ].map((feature) => (
                                        <div key={feature.label} className="flex items-start gap-1.5 text-xs bg-surface rounded px-2.5 py-1.5 border border-border-muted">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-content-primary font-medium">{feature.label}</p>
                                                <p className="text-content-muted text-[10px] mt-0.5">{feature.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Claude AI (1순위) */}
                            <div className="p-5 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                                        <div>
                                            <p className="text-base font-semibold text-content-primary">Claude AI</p>
                                            <p className="text-xs text-content-secondary mt-0.5">claude-sonnet-4-6</p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-semibold bg-orange-500 text-white rounded-full">
                                        1순위
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-content-secondary mb-1">
                                            오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                        </p>
                                        <p className="text-2xl font-bold text-content-primary">{apiCosts.claude.calls.today}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-orange-600 mt-1">${apiCosts.claude.today.toFixed(4)}</p>
                                    </div>
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-content-secondary mb-1">
                                            이번 달 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                        </p>
                                        <p className="text-2xl font-bold text-content-primary">{apiCosts.claude.calls.monthly}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-orange-600 mt-1">${apiCosts.claude.monthly.toFixed(4)}</p>
                                    </div>
                                </div>

                                <div className="bg-white/60 rounded-xl p-3 mb-3">
                                    <p className="text-xs font-medium text-orange-700 mb-2">
                                        토큰 사용량 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <p className="text-xs text-content-secondary">입력</p>
                                            <p className="text-sm font-bold text-content-primary">{(apiCosts.claude.tokens.monthly.input / 1000).toFixed(1)}K</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-content-secondary">출력</p>
                                            <p className="text-sm font-bold text-content-primary">{(apiCosts.claude.tokens.monthly.output / 1000).toFixed(1)}K</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-content-secondary">전체</p>
                                            <p className="text-sm font-bold text-orange-600">{(apiCosts.claude.tokens.monthly.total / 1000).toFixed(1)}K</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-orange-200">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-content-secondary">성공률</span>
                                        <span className="text-lg font-bold text-orange-600">
                                            {apiCosts.claude.calls.monthly > 0
                                                ? Math.round((apiCosts.claude.successes / apiCosts.claude.calls.monthly) * 100)
                                                : 100}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Groq AI (2순위) */}
                            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                                        <div>
                                            <p className="text-base font-semibold text-content-primary">Groq AI</p>
                                            <p className="text-xs text-content-secondary mt-0.5">Llama 3.1 8B Instant</p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-semibold bg-green-500 text-white rounded-full">
                                        2순위 (폴백)
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-content-secondary mb-1">
                                            오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                                        </p>
                                        <p className="text-2xl font-bold text-content-primary">{apiCosts.groq?.today || 0}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-green-600 mt-1">$0.00</p>
                                    </div>
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-content-secondary mb-1">
                                            이번 달 ({new Date().toLocaleDateString('ko-KR', { month: 'short' })} 1일~현재)
                                        </p>
                                        <p className="text-2xl font-bold text-content-primary">{apiCosts.groq?.monthly || 0}<span className="text-sm font-normal text-content-secondary ml-1">회</span></p>
                                        <p className="text-xs font-semibold text-green-600 mt-1">$0.00 (무료)</p>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-green-200">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-content-secondary">성공률</span>
                                        <span className="text-lg font-bold text-green-600">
                                            {apiCosts.groq?.monthly > 0
                                                ? Math.round((apiCosts.groq.successes / apiCosts.groq.monthly) * 100)
                                                : 100}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 전체 요약 */}
                            <div className="p-4 bg-gradient-to-r from-surface-subtle to-surface-muted rounded-xl border-2 border-border-strong">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-content-primary">AI 시스템 총 비용</p>
                                        <p className="text-xs text-content-secondary mt-0.5">
                                            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })} 누적
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-3xl font-bold text-content-primary">
                                            ${apiCosts.total.monthly.toFixed(2)}
                                        </p>
                                        {apiCosts.total.monthly === 0 ? (
                                            <p className="text-xs text-green-600 font-semibold mt-1">모두 무료</p>
                                        ) : (
                                            <p className="text-xs text-content-secondary mt-1">
                                                ≈ ₩{Math.round(apiCosts.total.monthly * 1300).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="border-t border-border pt-3 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-content-secondary flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                                            Claude AI
                                        </span>
                                        <span className="font-medium text-content-primary">${apiCosts.claude.monthly.toFixed(4)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-content-secondary flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                                            Groq AI
                                        </span>
                                        <span className="font-medium text-green-600">$0.00 (무료)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 최근 운영 로그 */}
            <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-content-primary">최근 운영 로그</h2>
                    <Link href="/admin/logs" className="text-xs text-content-muted hover:text-content-secondary">
                        전체 보기 →
                    </Link>
                </div>

                {logsLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-8 bg-surface-muted rounded animate-pulse" />
                        ))}
                    </div>
                ) : recentLogs.length === 0 ? (
                    <p className="text-sm text-content-muted py-4 text-center">로그가 없습니다</p>
                ) : (
                    <ul className="space-y-2">
                        {recentLogs.map((log) => (
                            <li key={log.id} className="flex items-center gap-2 py-1.5">
                                <span className={`shrink-0 px-2 py-0.5 text-xs rounded font-medium ${ACTION_BADGE[log.action] ?? 'bg-surface-muted text-content-secondary'}`}>
                                    {log.action}
                                </span>
                                <span className="text-xs text-content-secondary truncate flex-1">
                                    {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                    {log.target_id && <span className="text-content-muted ml-1">#{log.target_id.slice(0, 6)}</span>}
                                </span>
                                <span className="text-xs text-content-muted shrink-0">{fmt(log.created_at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
