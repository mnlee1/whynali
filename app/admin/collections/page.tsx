/**
 * app/admin/collections/page.tsx
 *
 * [관리자 - 시스템 모니터링 페이지]
 *
 * 트랙A 프로세스 상태, 커뮤니티 수집 상태, 경고 등을 모니터링합니다.
 * 상세 데이터는 접기/펼치기로 필요시에만 표시합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ─── 타입 ────────────────────────────────────────────────

interface TrackAStats {
    lastRun: {
        timestamp: string | null
        nextRun: string
        status: 'success' | 'error' | 'unknown'
        minutesAgo: number | null
    }
    last24h: {
        issuesCreated: number
        trackAIssues: number
        manualIssues: number
        trackAPercentage: number
    }
    communityCollection: {
        lastCollected: string | null
        last24h: number
        last3h: number
        status: 'active' | 'warning' | 'stopped'
        minutesAgo: number | null
    }
    warnings: Array<{
        type: 'critical' | 'warning' | 'info'
        message: string
        details?: string
    }>
    diagnostics: {
        possibleCauses: string[]
        recommendations: string[]
    }
}

interface CollectionStats {
    news: {
        total: number
        byCategory: Record<string, number>
        last24h: Record<string, number>
        linked: number
    }
    community: {
        total: number
        bySite: Record<string, number>
        last24h: Record<string, number>
        linked: number
    }
}

interface NewsItem {
    id: string
    title: string
    link: string | null
    source: string
    published_at: string | null
    created_at: string
    issue_id: string | null
    search_keyword: string  // 항상 있음 (트랙A 필수)
    issues: { id: string; title: string } | null
}

interface CommunityItem {
    id: string
    title: string
    source_site: string
    view_count: number
    comment_count: number
    written_at: string
    created_at: string
    updated_at: string
    url: string | null
    issue_id: string | null
    issues: { id: string; title: string } | null
}

interface ListResult<T> {
    data: T[]
    total: number
    page: number
    totalPages: number
}

type NewsSort = 'created_at' | 'published_at' | 'source'
type CommunitySort = 'written_at' | 'created_at' | 'updated_at' | 'view_count' | 'comment_count' | 'source_site'
type SortOrder = 'desc' | 'asc'
type LinkFilter = 'all' | 'linked' | 'unlinked'
type SiteFilter = '전체' | '더쿠' | '네이트판'

// ─── 서브 컴포넌트 ────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
    return (
        <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    )
}

function CronBadge({ label }: { label: string }) {
    return (
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-2">
            {label}
        </span>
    )
}

function TabBar<T extends string>({
    tabs,
    active,
    onChange,
}: {
    tabs: { value: T; label: string }[]
    active: T
    onChange: (v: T) => void
}) {
    return (
        <div className="flex gap-1">
            {tabs.map(({ value, label }) => (
                <button
                    key={value}
                    onClick={() => onChange(value)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                        active === value
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}

// 소팅 가능한 th — 클릭 시 컬럼 변경 또는 방향 토글
function Th({
    label,
    col,
    activeCol,
    activeOrder,
    onSort,
    className,
}: {
    label: string
    col: string
    activeCol: string
    activeOrder: SortOrder
    onSort: (col: string) => void
    className?: string
}) {
    const active = activeCol === col
    return (
        <th
            onClick={() => onSort(col)}
            className={`px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-800 ${className ?? 'text-left'}`}
        >
            {label}
            <span className="ml-1 inline-block w-3 text-gray-300">
                {active ? (activeOrder === 'desc' ? '↓' : '↑') : ''}
            </span>
        </th>
    )
}

function Pagination({
    page,
    totalPages,
    onChange,
}: {
    page: number
    totalPages: number
    onChange: (p: number) => void
}) {
    if (totalPages <= 1) return null

    const range: (number | '…')[] = []
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) range.push(i)
    } else {
        range.push(1)
        if (page > 3) range.push('…')
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
            range.push(i)
        }
        if (page < totalPages - 2) range.push('…')
        range.push(totalPages)
    }

    return (
        <div className="flex items-center justify-center gap-1 mt-4">
            <button
                onClick={() => onChange(page - 1)}
                disabled={page === 1}
                className="px-2 py-1 text-sm border rounded disabled:opacity-30 hover:bg-gray-50"
            >
                ←
            </button>
            {range.map((p, i) =>
                p === '…' ? (
                    <span key={`el-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onChange(p as number)}
                        className={`px-3 py-1 text-sm border rounded ${
                            page === p ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'
                        }`}
                    >
                        {p}
                    </button>
                )
            )}
            <button
                onClick={() => onChange(page + 1)}
                disabled={page === totalPages}
                className="px-2 py-1 text-sm border rounded disabled:opacity-30 hover:bg-gray-50"
            >
                →
            </button>
        </div>
    )
}

// ─── 메인 페이지 ─────────────────────────────────────────

export default function AdminCollectionsPage() {
    const [trackAStats, setTrackAStats] = useState<TrackAStats | null>(null)
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [showDetails, setShowDetails] = useState(false)
    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnosis, setDiagnosis] = useState<any>(null)
    const [collecting, setCollecting] = useState(false)
    const [collectResult, setCollectResult] = useState<any>(null)

    // 뉴스 목록 상태
    const [newsResult, setNewsResult] = useState<ListResult<NewsItem> | null>(null)
    const [newsLoading, setNewsLoading] = useState(true)
    const [newsPage, setNewsPage] = useState(1)
    const [newsSort, setNewsSort] = useState<NewsSort>('created_at')
    const [newsOrder, setNewsOrder] = useState<SortOrder>('desc')
    const [newsLinkFilter, setNewsLinkFilter] = useState<LinkFilter>('all')

    // 커뮤니티 목록 상태
    const [communityResult, setCommunityResult] = useState<ListResult<CommunityItem> | null>(null)
    const [communityLoading, setCommunityLoading] = useState(true)
    const [communityPage, setCommunityPage] = useState(1)
    const [communitySort, setCommunitySort] = useState<CommunitySort>('comment_count')
    const [communityOrder, setCommunityOrder] = useState<SortOrder>('desc')
    const [communitySiteFilter, setCommunitySiteFilter] = useState<SiteFilter>('전체')
    const [communityLinkFilter, setCommunityLinkFilter] = useState<LinkFilter>('all')

    // ─── fetch ──────────────────────────────────────────

    const fetchTrackAStats = async () => {
        try {
            const res = await fetch('/api/admin/collections/track-a-stats')
            if (!res.ok) return
            setTrackAStats(await res.json())
        } catch (error) {
            console.error('트랙A 통계 조회 실패:', error)
        }
    }

    const fetchStats = async () => {
        setStatsLoading(true)
        try {
            const [trackARes, statsRes] = await Promise.all([
                fetch('/api/admin/collections/track-a-stats'),
                fetch('/api/admin/collections')
            ])
            
            if (trackARes.ok) setTrackAStats(await trackARes.json())
            if (statsRes.ok) setStats(await statsRes.json())
            
            setLastRefreshedAt(new Date())
        } finally {
            setStatsLoading(false)
        }
    }

    const runDiagnosis = async () => {
        setDiagnosing(true)
        try {
            const res = await fetch('/api/admin/collections/diagnose')
            if (res.ok) {
                setDiagnosis(await res.json())
            }
        } catch (error) {
            console.error('진단 실패:', error)
        } finally {
            setDiagnosing(false)
        }
    }

    const runManualCollect = async () => {
        setCollecting(true)
        setCollectResult(null)
        try {
            const res = await fetch('/api/admin/collections/manual-collect', {
                method: 'POST'
            })
            const data = await res.json()
            setCollectResult(data)
            
            // 수집 성공 시 통계 자동 갱신
            if (data.success) {
                setTimeout(() => {
                    fetchStats()
                }, 2000)
            }
        } catch (error) {
            console.error('수동 수집 실패:', error)
            setCollectResult({
                success: false,
                error: 'FETCH_ERROR',
                message: 'API 호출 실패',
                details: String(error)
            })
        } finally {
            setCollecting(false)
        }
    }

    const fetchNews = async (
        page: number,
        sort: NewsSort,
        order: SortOrder,
        linkFilter: LinkFilter,
    ) => {
        setNewsLoading(true)
        try {
                    const linked =
                        linkFilter === 'linked' ? '&linked=true' :
                        linkFilter === 'unlinked' ? '&linked=false' : ''
                    const res = await fetch(
                        `/api/admin/collections/news?page=${page}&sort=${sort}&order=${order}${linked}`
                    )
                    if (!res.ok) return
                    setNewsResult(await res.json())
        } finally {
            setNewsLoading(false)
        }
    }

    const fetchCommunity = async (
        page: number,
        sort: CommunitySort,
        order: SortOrder,
        site: SiteFilter,
        linkFilter: LinkFilter,
    ) => {
        setCommunityLoading(true)
        try {
            const siteParam = site !== '전체' ? `&site=${encodeURIComponent(site)}` : ''
            const linked =
                linkFilter === 'linked' ? '&linked=true' :
                linkFilter === 'unlinked' ? '&linked=false' : ''
            const res = await fetch(
                `/api/admin/collections/community?page=${page}&sort=${sort}&order=${order}${siteParam}${linked}`
            )
            if (!res.ok) return
            setCommunityResult(await res.json())
        } finally {
            setCommunityLoading(false)
        }
    }

    // ─── 소팅 핸들러 ─────────────────────────────────────

    const handleNewsSort = (col: string) => {
        const newOrder: SortOrder =
            col === newsSort ? (newsOrder === 'desc' ? 'asc' : 'desc') : 'desc'
        const newSort = col as NewsSort
        setNewsSort(newSort)
        setNewsOrder(newOrder)
        setNewsPage(1)
        fetchNews(1, newSort, newOrder, newsLinkFilter)
    }

    const handleCommunitySort = (col: string) => {
        const newOrder: SortOrder =
            col === communitySort ? (communityOrder === 'desc' ? 'asc' : 'desc') : 'desc'
        const newSort = col as CommunitySort
        setCommunitySort(newSort)
        setCommunityOrder(newOrder)
        setCommunityPage(1)
        fetchCommunity(1, newSort, newOrder, communitySiteFilter, communityLinkFilter)
    }

    // ─── 필터·페이지 변경 핸들러 ─────────────────────────

    const handleNewsLinkFilter = (v: LinkFilter) => {
        setNewsLinkFilter(v)
        setNewsPage(1)
        fetchNews(1, newsSort, newsOrder, v)
    }

    const handleNewsPage = (p: number) => {
        setNewsPage(p)
        fetchNews(p, newsSort, newsOrder, newsLinkFilter)
    }

    const handleCommunitySite = (v: SiteFilter) => {
        setCommunitySiteFilter(v)
        setCommunityPage(1)
        fetchCommunity(1, communitySort, communityOrder, v, communityLinkFilter)
    }

    const handleCommunityLinkFilter = (v: LinkFilter) => {
        setCommunityLinkFilter(v)
        setCommunityPage(1)
        fetchCommunity(1, communitySort, communityOrder, communitySiteFilter, v)
    }

    const handleCommunityPage = (p: number) => {
        setCommunityPage(p)
        fetchCommunity(p, communitySort, communityOrder, communitySiteFilter, communityLinkFilter)
    }

    // ─── 초기 로드 ───────────────────────────────────────

    useEffect(() => {
        fetchStats()
        fetchNews(1, 'created_at', 'desc', 'all')
        fetchCommunity(1, 'comment_count', 'desc', '전체', 'all')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ─── 유틸 ────────────────────────────────────────────

    const decodeHtml = (str: string) => {
        if (typeof document === 'undefined') return str
        const el = document.createElement('textarea')
        el.innerHTML = str
        return el.value
    }

    const fmt = (d: string) => {
        const date = new Date(d)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    const LINK_TABS: { value: LinkFilter; label: string }[] = [
        { value: 'all', label: '전체' },
        { value: 'linked', label: '연결' },
        { value: 'unlinked', label: '미연결' },
    ]
    const SITE_TABS: { value: SiteFilter; label: string }[] = [
        { value: '전체', label: '전체' },
        { value: '더쿠', label: '더쿠' },
        { value: '네이트판', label: '네이트판' },
    ]

    // ─── 렌더 ────────────────────────────────────────────

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
            case 'success':
                return 'text-green-600 bg-green-50 border-green-200'
            case 'warning':
                return 'text-yellow-600 bg-yellow-50 border-yellow-200'
            case 'stopped':
            case 'error':
                return 'text-red-600 bg-red-50 border-red-200'
            default:
                return 'text-gray-600 bg-gray-50 border-gray-200'
        }
    }

    const formatTimeAgo = (minutes: number | null) => {
        if (minutes === null) return '알 수 없음'
        if (minutes < 1) return '방금 전'
        if (minutes < 60) return `${minutes}분 전`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}시간 전`
        const days = Math.floor(hours / 24)
        return `${days}일 전`
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">시스템 모니터링</h1>
                    <p className="text-sm text-gray-500 mt-1">트랙A 프로세스 및 수집 시스템 상태</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            갱신 {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchStats}
                        disabled={statsLoading}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                        {statsLoading ? '로딩 중…' : '새로고침'}
                    </button>
                </div>
            </div>

            {/* 경고 및 알림 */}
            {trackAStats && trackAStats.warnings.length > 0 && (
                <div className="mb-6 space-y-3">
                    {trackAStats.warnings.map((warning, index) => (
                        <div
                            key={index}
                            className={`p-4 rounded-lg border ${
                                warning.type === 'critical'
                                    ? 'bg-red-50 border-red-200'
                                    : warning.type === 'warning'
                                    ? 'bg-yellow-50 border-yellow-200'
                                    : 'bg-blue-50 border-blue-200'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <span className="text-lg mt-0.5">
                                    {warning.type === 'critical' ? '🔴' : warning.type === 'warning' ? '⚠️' : 'ℹ️'}
                                </span>
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${
                                        warning.type === 'critical'
                                            ? 'text-red-700'
                                            : warning.type === 'warning'
                                            ? 'text-yellow-700'
                                            : 'text-blue-700'
                                    }`}>
                                        {warning.message}
                                    </p>
                                    {warning.details && (
                                        <p className="text-xs text-gray-600 mt-1">{warning.details}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* 진단 정보 */}
                    {trackAStats.diagnostics.possibleCauses.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">🔍 가능한 원인</h3>
                            <ul className="space-y-1">
                                {trackAStats.diagnostics.possibleCauses.map((cause, idx) => (
                                    <li key={idx} className="text-xs text-gray-600 pl-2">
                                        {cause}
                                    </li>
                                ))}
                            </ul>
                            
                            {trackAStats.diagnostics.recommendations.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-2">💡 해결 방법</h3>
                                    <ul className="space-y-1">
                                        {trackAStats.diagnostics.recommendations.map((rec, idx) => (
                                            <li key={idx} className="text-xs text-gray-600 pl-2">
                                                {rec}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            
                            {/* 진단 버튼 */}
                            <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                                <button
                                    onClick={runDiagnosis}
                                    disabled={diagnosing}
                                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {diagnosing ? '진단 중...' : '🔍 상세 진단 실행'}
                                </button>
                                <button
                                    onClick={runManualCollect}
                                    disabled={collecting}
                                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                    {collecting ? '수집 중...' : '▶️ 수동 수집 실행'}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* 수동 수집 결과 */}
                    {collectResult && (
                        <div className={`border rounded-lg p-4 mt-3 ${
                            collectResult.success 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-red-50 border-red-200'
                        }`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-700">
                                    {collectResult.success ? '✅ 수집 성공' : '❌ 수집 실패'}
                                </h3>
                                <button
                                    onClick={() => setCollectResult(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                    닫기
                                </button>
                            </div>
                            
                            {collectResult.success ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">더쿠:</span>
                                        <span className="font-medium text-green-700">
                                            {collectResult.theqoo.collected}건 수집 
                                            {collectResult.theqoo.skipped > 0 && 
                                                ` (${collectResult.theqoo.skipped}건 스킵)`
                                            }
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">네이트판:</span>
                                        <span className="font-medium text-green-700">
                                            {collectResult.natePann.collected}건 수집
                                            {collectResult.natePann.skipped > 0 && 
                                                ` (${collectResult.natePann.skipped}건 스킵)`
                                            }
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>소요 시간:</span>
                                        <span>{collectResult.elapsed}</span>
                                    </div>
                                    {(collectResult.theqoo.warning || collectResult.natePann.warning) && (
                                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                                            {collectResult.theqoo.warning && <p>⚠️ 더쿠: {collectResult.theqoo.warning}</p>}
                                            {collectResult.natePann.warning && <p>⚠️ 네이트판: {collectResult.natePann.warning}</p>}
                                        </div>
                                    )}
                                    <p className="text-xs text-green-600 mt-2">
                                        💡 통계가 자동으로 갱신됩니다 (2초 후)
                                    </p>
                                </div>
                            ) : (
                                <div className="text-sm">
                                    <p className="text-red-700 font-medium">{collectResult.message}</p>
                                    {collectResult.details && (
                                        <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded overflow-x-auto">
                                            {collectResult.details}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* 진단 결과 */}
                    {diagnosis && (
                        <div className="bg-white border border-gray-300 rounded-lg p-4 mt-3">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-700">📊 진단 결과</h3>
                                <button
                                    onClick={() => setDiagnosis(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                    닫기
                                </button>
                            </div>
                            
                            {diagnosis.criticalIssue && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded">
                                    <p className="text-sm font-bold text-red-700">🚨 핵심 문제</p>
                                    <p className="text-sm text-red-600 mt-1">{diagnosis.criticalIssue}</p>
                                </div>
                            )}
                            
                            {diagnosis.currentBranch && (
                                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-xs text-yellow-700">
                                        현재 브랜치: <code className="font-mono font-bold">{diagnosis.currentBranch}</code>
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ GitHub Actions 크론은 main/develop 브랜치에서만 실행됩니다
                                    </p>
                                </div>
                            )}
                            
                            <p className="text-sm font-medium text-gray-800 mb-3">{diagnosis.conclusion}</p>
                            
                            <div className="space-y-2">
                                {diagnosis.checks.map((check: any, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2 text-xs">
                                        <span>
                                            {check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'}
                                        </span>
                                        <div className="flex-1">
                                            <span className="font-medium">{check.name}:</span>{' '}
                                            <span className="text-gray-600">{check.message}</span>
                                            {check.details && (
                                                <pre className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-x-auto">
                                                    {JSON.stringify(check.details, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 트랙A 프로세스 상태 */}
            {trackAStats && (
                <div className="bg-white border rounded-lg p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">트랙A 프로세스 상태</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className={`p-4 rounded-lg border ${getStatusColor(trackAStats.lastRun.status)}`}>
                            <p className="text-xs text-gray-500 mb-1">마지막 이슈 생성</p>
                            <p className="text-xl font-bold">
                                {trackAStats.lastRun.minutesAgo !== null
                                    ? formatTimeAgo(trackAStats.lastRun.minutesAgo)
                                    : '없음'}
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
                            <p className="text-xs text-gray-500 mb-1">다음 실행 예정</p>
                            <p className="text-xl font-bold text-blue-600">
                                {new Date(trackAStats.lastRun.nextRun).toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">30분 주기</p>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-gray-50 border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">24시간 이슈 생성</p>
                            <p className="text-xl font-bold text-gray-900">
                                {trackAStats.last24h.issuesCreated}건
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                트랙A {trackAStats.last24h.trackAIssues}건 ({trackAStats.last24h.trackAPercentage}%)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 커뮤니티 수집 상태 */}
            {trackAStats && (
                <div className="bg-white border rounded-lg p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">커뮤니티 수집 상태</h2>
                    
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                        <p className="font-medium mb-1">📌 수집 전략 (선별적 크롤링)</p>
                        <ul className="text-xs space-y-0.5 ml-4 list-disc">
                            <li>더쿠: 스퀘어 게시판 인기글</li>
                            <li>네이트판: 랭킹 페이지 인기글</li>
                            <li>이슈 연결 게시글 지속 추적</li>
                            <li>인기글 (조회수 3만+ 또는 댓글 50+) 추가 크롤링</li>
                        </ul>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-4 rounded-lg border ${getStatusColor(trackAStats.communityCollection.status)}`}>
                            <p className="text-xs text-gray-500 mb-1">마지막 수집</p>
                            <p className="text-xl font-bold">
                                {formatTimeAgo(trackAStats.communityCollection.minutesAgo)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                상태: {trackAStats.communityCollection.status === 'active' ? '정상' : '경고'}
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-gray-50 border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">24시간 수집</p>
                            <p className="text-xl font-bold text-gray-900">
                                {trackAStats.communityCollection.last24h.toLocaleString()}건
                            </p>
                            <p className="text-xs text-gray-500 mt-1">3분 주기</p>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-gray-50 border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">최근 3시간</p>
                            <p className="text-xl font-bold text-gray-900">
                                {trackAStats.communityCollection.last3h.toLocaleString()}건
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 상세 데이터 접기/펼치기 */}
            <div className="mb-6">
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full p-4 text-left bg-white border rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                    <span className="font-medium text-gray-700">
                        {showDetails ? '▼' : '▶'} 상세 수집 데이터 {showDetails ? '접기' : '펼치기'}
                    </span>
                    <span className="text-xs text-gray-500">
                        트랙A 검색 뉴스 및 커뮤니티 수집 목록
                    </span>
                </button>
            </div>

            {/* 상세 데이터 (접기/펼치기) */}
            {showDetails && (
                <div className="space-y-10">
            {/* ── 트랙A 검색 뉴스 목록 ── */}
            <section className="mb-10">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-gray-800">트랙A 검색 뉴스</h2>
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        AI 키워드 검색 전용
                    </span>
                    {!newsLoading && newsResult && (
                        <span className="text-xs text-gray-400 ml-auto">
                            총 {newsResult.total.toLocaleString()}건
                        </span>
                    )}
                </div>

                {/* 연결 상태 탭 */}
                <div className="mb-3">
                    <TabBar tabs={LINK_TABS} active={newsLinkFilter} onChange={handleNewsLinkFilter} />
                </div>

                <div className="bg-white border rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-full">
                                    제목
                                </th>
                                <Th label="출처" col="source" activeCol={newsSort} activeOrder={newsOrder} onSort={handleNewsSort} />
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                                    검색 키워드
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                                    연결 이슈
                                </th>
                                <Th label="발행일" col="published_at" activeCol={newsSort} activeOrder={newsOrder} onSort={handleNewsSort} />
                                <Th label="수집일" col="created_at" activeCol={newsSort} activeOrder={newsOrder} onSort={handleNewsSort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {newsLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-sm text-gray-400 text-center">로딩 중…</td>
                                </tr>
                            ) : !newsResult || newsResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-sm text-gray-400 text-center">수집된 뉴스가 없습니다</td>
                                </tr>
                            ) : (
                                newsResult.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 text-sm max-w-xs">
                                            {item.link ? (
                                                <a href={item.link} target="_blank" rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline line-clamp-1">
                                                    {decodeHtml(item.title)}
                                                </a>
                                            ) : (
                                                <span className="line-clamp-1">{decodeHtml(item.title)}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{item.source}</td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                            {item.search_keyword
                                                ? <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{item.search_keyword}</span>
                                                : <span className="text-gray-300">-</span>
                                            }
                                        </td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                            {item.issues ? (
                                                <Link href={`/issue/${item.issues.id}`} target="_blank"
                                                    className="text-blue-600 hover:underline">
                                                    {item.issues.title}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-300">미연결</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                            {item.published_at ? fmt(item.published_at) : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                            {fmt(item.created_at)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {newsResult && (
                    <Pagination page={newsPage} totalPages={newsResult.totalPages} onChange={handleNewsPage} />
                )}
            </section>

            {/* ── 수집 커뮤니티 목록 ── */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-gray-800">수집 커뮤니티</h2>
                    <CronBadge label="3분 주기" />
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        인기글 선별 수집
                    </span>
                    {!communityLoading && communityResult && (
                        <span className="text-xs text-gray-400 ml-auto">
                            총 {communityResult.total.toLocaleString()}건
                        </span>
                    )}
                </div>

                {/* 사이트 탭 + 연결 상태 탭 */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <TabBar tabs={SITE_TABS} active={communitySiteFilter} onChange={handleCommunitySite} />
                    <div className="w-px h-5 bg-gray-200" />
                    <TabBar tabs={LINK_TABS} active={communityLinkFilter} onChange={handleCommunityLinkFilter} />
                </div>

                <div className="bg-white border rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">제목</th>
                                <Th label="사이트" col="source_site" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap w-48">연결 이슈</th>
                                <Th label="조회" col="view_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="댓글" col="comment_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="작성일" col="written_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <Th label="수집일" col="created_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <Th label="갱신일" col="updated_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {communityLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-sm text-gray-400 text-center">로딩 중…</td>
                                </tr>
                            ) : !communityResult || communityResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-sm text-gray-400 text-center">수집된 게시글이 없습니다</td>
                                </tr>
                            ) : (
                                communityResult.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 text-sm">
                                            {item.url ? (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer"
                                                    className="text-gray-900 hover:text-blue-600 hover:underline line-clamp-1">
                                                    {item.title}
                                                </a>
                                            ) : (
                                                <span className="line-clamp-1">{item.title}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${
                                                item.source_site === '더쿠'
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-purple-100 text-purple-700'
                                            }`}>
                                                {item.source_site}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap max-w-[12rem]">
                                            {item.issues ? (
                                                <Link href={`/issue/${item.issues.id}`}
                                                    className="text-blue-600 hover:underline line-clamp-1 block">
                                                    {item.issues.title}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-300">미연결</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right whitespace-nowrap">
                                            {item.view_count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right whitespace-nowrap">
                                            {item.comment_count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                            {fmt(item.written_at)}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                            {fmt(item.created_at)}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                            {fmt(item.updated_at)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {communityResult && (
                    <Pagination
                        page={communityPage}
                        totalPages={communityResult.totalPages}
                        onChange={handleCommunityPage}
                    />
                )}
            </section>
                </div>
            )}
        </div>
    )
}
