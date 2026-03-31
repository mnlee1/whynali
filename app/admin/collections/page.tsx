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
    written_at: string | null
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

type PageTab = '수집 데이터' | '이슈 자동화 로그'

type TrackAResult =
    | 'issue_created'
    | 'auto_approved'
    | 'duplicate_linked'
    | 'ai_rejected'
    | 'no_news'
    | 'no_community'
    | 'heat_too_low'
    | 'no_news_linked'
    | 'no_timeline'
    | 'validation_failed'
    | 'rate_limited'
    | 'error'

interface TrackALog {
    id: string
    run_at: string
    keyword: string
    burst_count: number
    result: TrackAResult
    issue_id: string | null
    details: Record<string, unknown> | null
    issues: { id: string; title: string; heat_index: number; approval_status: string } | null
}

interface TrackALogsResponse {
    data: TrackALog[]
    total: number
    summary: Record<string, number>
}

type NewsSort = 'created_at' | 'published_at' | 'source'
type CommunitySort = 'written_at' | 'created_at' | 'updated_at' | 'view_count' | 'comment_count' | 'source_site'
type SortOrder = 'desc' | 'asc'
type LinkFilter = 'all' | 'linked' | 'unlinked'
type SiteFilter = '전체' | '더쿠' | '네이트판' | '클리앙' | '보배드림' | '뽐뿌'

// ─── 서브 컴포넌트 ────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
    return (
        <div className="text-center">
            <p className="text-xs text-content-secondary mb-1">{label}</p>
            <p className="text-2xl font-bold text-content-primary">{value.toLocaleString()}</p>
            {sub && <p className="text-xs text-content-muted mt-0.5">{sub}</p>}
        </div>
    )
}

function CronBadge({ label }: { label: string }) {
    return (
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-surface-muted text-content-secondary ml-2">
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
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface text-content-secondary border-border hover:border-border-strong'
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
            className={`px-4 py-2.5 text-xs font-medium text-content-muted whitespace-nowrap cursor-pointer select-none hover:text-content-primary ${className ?? 'text-left'}`}
        >
            {label}
            <span className="ml-1 inline-block w-3 text-content-muted">
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
                className="px-2 py-1 text-sm border border-border rounded-xl disabled:opacity-30 hover:bg-surface-muted"
            >
                ←
            </button>
            {range.map((p, i) =>
                p === '…' ? (
                    <span key={`el-${i}`} className="px-2 text-content-muted text-sm">…</span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onChange(p as number)}
                        className={`px-3 py-1 text-sm border rounded-xl ${
                            page === p ? 'bg-primary text-white border-primary' : 'border-border hover:bg-surface-muted'
                        }`}
                    >
                        {p}
                    </button>
                )
            )}
            <button
                onClick={() => onChange(page + 1)}
                disabled={page === totalPages}
                className="px-2 py-1 text-sm border border-border rounded-xl disabled:opacity-30 hover:bg-surface-muted"
            >
                →
            </button>
        </div>
    )
}

// ─── 메인 페이지 ─────────────────────────────────────────

export default function AdminCollectionsPage() {
    const [pageTab, setPageTab] = useState<PageTab>('수집 데이터')

    const [trackAStats, setTrackAStats] = useState<TrackAStats | null>(null)
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [showDetails, setShowDetails] = useState(false)
    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnosis, setDiagnosis] = useState<any>(null)
    const [collecting, setCollecting] = useState(false)
    const [collectResult, setCollectResult] = useState<any>(null)

    // 이슈 자동화 로그 상태
    const [pipelineLogs, setPipelineLogs] = useState<TrackALogsResponse | null>(null)
    const [pipelineLoading, setPipelineLoading] = useState(false)
    const [pipelineResultFilter, setPipelineResultFilter] = useState<TrackAResult | 'all'>('all')
    const [pipelineDateFilter, setPipelineDateFilter] = useState<string>(
        new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD (스웨덴 로케일이 ISO 형식)
    )
    const [availableDates, setAvailableDates] = useState<string[]>([])

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

    const fetchAvailableDates = async () => {
        try {
            const res = await fetch('/api/admin/track-a-logs?available_dates=true')
            if (res.ok) {
                const { dates } = await res.json()
                setAvailableDates(dates ?? [])
            }
        } catch (error) {
            console.error('사용 가능한 날짜 조회 실패:', error)
        }
    }

    const fetchPipelineLogs = async (
        resultFilter: TrackAResult | 'all' = 'all',
        dateFilter: string = '',
    ) => {
        setPipelineLoading(true)
        try {
            const resultParam = resultFilter !== 'all' ? `&result=${resultFilter}` : ''
            const dateParam = dateFilter ? `&date=${dateFilter}` : ''
            const res = await fetch(`/api/admin/track-a-logs?limit=100${resultParam}${dateParam}`)
            if (res.ok) setPipelineLogs(await res.json())
        } catch (error) {
            console.error('이슈 자동화 로그 조회 실패:', error)
        } finally {
            setPipelineLoading(false)
        }
    }

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

    useEffect(() => {
        if (pageTab === '이슈 자동화 로그') {
            if (!pipelineLogs) fetchPipelineLogs()
            if (availableDates.length === 0) fetchAvailableDates()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageTab])

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
        { value: '클리앙', label: '클리앙' },
        { value: '보배드림', label: '보배드림' },
        { value: '뽐뿌', label: '뽐뿌' },
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">수집 현황</h1>
                    <p className="text-sm text-content-secondary mt-1">트랙A 프로세스 및 수집 시스템 상태</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-content-muted">
                            갱신 {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => {
                            if (pageTab === '이슈 자동화 로그') {
                                fetchPipelineLogs(pipelineResultFilter, pipelineDateFilter)
                            } else {
                                fetchStats()
                                fetchNews(newsPage, newsSort, newsOrder, newsLinkFilter)
                                fetchCommunity(communityPage, communitySort, communityOrder, communitySiteFilter, communityLinkFilter)
                            }
                        }}
                        disabled={statsLoading || pipelineLoading}
                        className="btn-neutral btn-md disabled:opacity-50"
                    >
                        {statsLoading || pipelineLoading ? '로딩 중…' : '새로고침'}
                    </button>
                </div>
            </div>

            {/* 페이지 탭 */}
            <div className="mb-6">
                <TabBar<PageTab>
                    tabs={[
                        { value: '수집 데이터', label: '수집 데이터' },
                        { value: '이슈 자동화 로그', label: '이슈 자동화 로그' },
                    ]}
                    active={pageTab}
                    onChange={setPageTab}
                />
            </div>

            {/* ── 수집 데이터 탭 ─────────────────────────── */}
            {pageTab === '수집 데이터' && (<>

            {/* 경고 및 알림 */}
            {trackAStats && trackAStats.warnings.length > 0 && (
                <div className="mb-6 space-y-3">
                    {trackAStats.warnings.map((warning, index) => (
                        <div
                            key={index}
                            className={`p-4 rounded-xl border ${
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
                                        <p className="text-xs text-content-secondary mt-1">{warning.details}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* 진단 정보 */}
                    {trackAStats.diagnostics.possibleCauses.length > 0 && (
                        <div className="bg-surface-subtle border border-border rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-content-primary mb-2">🔍 가능한 원인</h3>
                            <ul className="space-y-1">
                                {trackAStats.diagnostics.possibleCauses.map((cause, idx) => (
                                    <li key={idx} className="text-xs text-content-secondary pl-2">
                                        {cause}
                                    </li>
                                ))}
                            </ul>
                            
                            {trackAStats.diagnostics.recommendations.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-content-primary mt-4 mb-2">💡 해결 방법</h3>
                                    <ul className="space-y-1">
                                        {trackAStats.diagnostics.recommendations.map((rec, idx) => (
                                            <li key={idx} className="text-xs text-content-secondary pl-2">
                                                {rec}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            
                            {/* 진단 버튼 */}
                            <div className="mt-4 pt-4 border-t border-border flex gap-2">
                                <button
                                    onClick={runDiagnosis}
                                    disabled={diagnosing}
                                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                                >
                                    {diagnosing ? '진단 중...' : '🔍 상세 진단 실행'}
                                </button>
                                <button
                                    onClick={runManualCollect}
                                    disabled={collecting}
                                    className="px-4 py-2 text-sm bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                                >
                                    {collecting ? '수집 중...' : '▶️ 수동 수집 실행'}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* 수동 수집 결과 */}
                    {collectResult && (
                        <div className={`border rounded-xl p-4 mt-3 ${
                            collectResult.success 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-red-50 border-red-200'
                        }`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-content-primary">
                                    {collectResult.success ? '✅ 수집 성공' : '❌ 수집 실패'}
                                </h3>
                                <button
                                    onClick={() => setCollectResult(null)}
                                    className="text-xs text-content-muted hover:text-content-secondary"
                                >
                                    닫기
                                </button>
                            </div>
                            
                            {collectResult.success ? (
                                <div className="space-y-2 text-sm">
                                    {[
                                        { key: 'theqoo', label: '더쿠' },
                                        { key: 'natePann', label: '네이트판' },
                                        { key: 'clien', label: '클리앙' },
                                        { key: 'bobaedream', label: '보배드림' },
                                        { key: 'ppomppu', label: '뽐뿌' },
                                    ].map(({ key, label }) => {
                                        const r = collectResult[key]
                                        if (!r) return null
                                        return (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-content-primary">{label}:</span>
                                                <span className="font-medium text-green-700">
                                                    {r.collected}건 수집
                                                    {r.skipped > 0 && ` (${r.skipped}건 스킵)`}
                                                </span>
                                            </div>
                                        )
                                    })}
                                    <div className="flex items-center justify-between text-xs text-content-secondary">
                                        <span>소요 시간:</span>
                                        <span>{collectResult.elapsed}</span>
                                    </div>
                                    {['theqoo', 'natePann', 'clien', 'bobaedream', 'ruliweb', 'ppomppu'].some(
                                        k => collectResult[k]?.warning
                                    ) && (
                                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-700 space-y-1">
                                            {[
                                                { key: 'theqoo', label: '더쿠' },
                                                { key: 'natePann', label: '네이트판' },
                                                { key: 'clien', label: '클리앙' },
                                                { key: 'bobaedream', label: '보배드림' },
                                                { key: 'ppomppu', label: '뽐뿌' },
                                            ].map(({ key, label }) =>
                                                collectResult[key]?.warning
                                                    ? <p key={key}>⚠️ {label}: {collectResult[key].warning}</p>
                                                    : null
                                            )}
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
                                        <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded-xl overflow-x-auto">
                                            {collectResult.details}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* 진단 결과 */}
                    {diagnosis && (
                        <div className="card p-4 mt-3">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-content-primary">📊 진단 결과</h3>
                                <button
                                    onClick={() => setDiagnosis(null)}
                                    className="text-xs text-content-muted hover:text-content-secondary"
                                >
                                    닫기
                                </button>
                            </div>
                            
                            {diagnosis.criticalIssue && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                                    <p className="text-sm font-bold text-red-700">🚨 핵심 문제</p>
                                    <p className="text-sm text-red-600 mt-1">{diagnosis.criticalIssue}</p>
                                </div>
                            )}
                            
                            {diagnosis.currentBranch && (
                                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-xl">
                                    <p className="text-xs text-yellow-700">
                                        현재 브랜치: <code className="font-mono font-bold">{diagnosis.currentBranch}</code>
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ GitHub Actions 크론은 main/develop 브랜치에서만 실행됩니다
                                    </p>
                                </div>
                            )}
                            
                            <p className="text-sm font-medium text-content-primary mb-3">{diagnosis.conclusion}</p>
                            
                            <div className="space-y-2">
                                {diagnosis.checks.map((check: any, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2 text-xs">
                                        <span>
                                            {check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'}
                                        </span>
                                        <div className="flex-1">
                                            <span className="font-medium">{check.name}:</span>{' '}
                                            <span className="text-content-secondary">{check.message}</span>
                                            {check.details && (
                                                <pre className="mt-1 text-xs text-content-secondary bg-surface-muted p-2 rounded-xl overflow-x-auto">
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
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-semibold text-content-primary mb-4">트랙A 프로세스 상태</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className={`p-4 rounded-xl border ${getStatusColor(trackAStats.lastRun.status)}`}>
                            <p className="text-xs text-content-secondary mb-1">마지막 이슈 생성</p>
                            <p className="text-xl font-bold">
                                {trackAStats.lastRun.minutesAgo !== null
                                    ? formatTimeAgo(trackAStats.lastRun.minutesAgo)
                                    : '없음'}
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-xl border bg-blue-50 border-blue-200">
                            <p className="text-xs text-content-secondary mb-1">다음 실행 예정</p>
                            <p className="text-xl font-bold text-blue-600">
                                {new Date(trackAStats.lastRun.nextRun).toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                            <p className="text-xs text-content-secondary mt-1">10분 주기</p>
                        </div>
                        
                        <div className="p-4 rounded-xl border bg-surface-subtle border-border">
                            <p className="text-xs text-content-secondary mb-1">24시간 이슈 생성</p>
                            <p className="text-xl font-bold text-content-primary">
                                {trackAStats.last24h.issuesCreated}건
                            </p>
                            <p className="text-xs text-content-secondary mt-1">
                                트랙A {trackAStats.last24h.trackAIssues}건 ({trackAStats.last24h.trackAPercentage}%)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 커뮤니티 수집 상태 */}
            {trackAStats && (
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-semibold text-content-primary mb-4">커뮤니티 수집 상태</h2>
                    
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                        <p className="font-medium mb-2">수집 채널 및 게시판</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                            {[
                                { site: '더쿠', board: '전체 게시판', url: 'https://theqoo.net/total' },
                                { site: '네이트판', board: '랭킹', url: 'https://pann.nate.com/talk/ranking' },
                                { site: '클리앙', board: '전체 게시판', url: 'https://www.clien.net/service/group/board_all' },
                                { site: '보배드림', board: '자유게시판', url: 'https://www.bobaedream.co.kr/list?code=freeb', noOffice: true },
                                { site: '루리웹', board: '이슈&토론', url: 'https://bbs.ruliweb.com/community/board/300143', disabled: true },
                                { site: '뽐뿌', board: '자유게시판', url: 'https://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard', noOffice: true },
                            ].map(({ site, board, url, disabled, noOffice }) => (
                                disabled ? (
                                    <span
                                        key={site}
                                        className="flex items-center gap-1.5 text-xs text-content-muted line-through"
                                    >
                                        <span className="font-medium">{site}</span>
                                        <span>·</span>
                                        <span>{board}</span>
                                        <span className="no-underline text-xs bg-surface-muted text-content-muted px-1 rounded-full">봇차단</span>
                                    </span>
                                ) : (
                                    <a
                                        key={site}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 hover:underline"
                                    >
                                        <span className="font-medium">{site}</span>
                                        <span className="text-blue-400">·</span>
                                        <span>{board}</span>
                                        {noOffice && <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">회사IP 접근 불가</span>}
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-blue-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                                        </svg>
                                    </a>
                                )
                            ))}
                        </div>
                        <p className="text-xs text-blue-500 mt-2">이슈 연결 게시글 지속 추적 · 인기글(조회 3만+ 또는 댓글 50+) 추가 크롤링</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-4 rounded-xl border ${getStatusColor(trackAStats.communityCollection.status)}`}>
                            <p className="text-xs text-content-secondary mb-1">마지막 수집</p>
                            <p className="text-xl font-bold">
                                {formatTimeAgo(trackAStats.communityCollection.minutesAgo)}
                            </p>
                            <p className="text-xs text-content-secondary mt-1">
                                상태: {trackAStats.communityCollection.status === 'active' ? '정상' : '경고'}
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-xl border bg-surface-subtle border-border">
                            <p className="text-xs text-content-secondary mb-1">24시간 수집</p>
                            <p className="text-xl font-bold text-content-primary">
                                {trackAStats.communityCollection.last24h.toLocaleString()}건
                            </p>
                            <p className="text-xs text-content-secondary mt-1">1분 주기</p>
                        </div>
                        
                        <div className="p-4 rounded-xl border bg-surface-subtle border-border">
                            <p className="text-xs text-content-secondary mb-1">최근 3시간</p>
                            <p className="text-xl font-bold text-content-primary">
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
                    className="w-full p-4 text-left card hover:bg-surface-subtle transition-colors flex items-center justify-between"
                >
                    <span className="font-medium text-content-primary">
                        {showDetails ? '▼' : '▶'} 상세 수집 데이터 {showDetails ? '접기' : '펼치기'}
                    </span>
                    <span className="text-xs text-content-secondary">
                        트랙A 검색 뉴스 및 커뮤니티 수집 목록
                    </span>
                </button>
            </div>

            {/* 상세 데이터 (접기/펼치기) */}
            {showDetails && (
                <div className="space-y-10">
            {/* ── 수집 커뮤니티 목록 ── */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-content-primary">수집 커뮤니티</h2>
                    <CronBadge label="1분 주기" />
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-primary-light text-primary-dark">
                        인기글 선별 수집
                    </span>
                    {!communityLoading && communityResult && (
                        <span className="text-xs text-content-muted ml-auto">
                            총 {communityResult.total.toLocaleString()}건
                        </span>
                    )}
                </div>

                {/* 사이트 탭 + 연결 상태 탭 */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <TabBar tabs={SITE_TABS} active={communitySiteFilter} onChange={handleCommunitySite} />
                    <div className="w-px h-5 bg-border" />
                    <TabBar tabs={LINK_TABS} active={communityLinkFilter} onChange={handleCommunityLinkFilter} />
                </div>

                <div className="card overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-muted">
                        <thead className="bg-surface-subtle">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted">제목</th>
                                <Th label="사이트" col="source_site" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap w-48">연결 이슈</th>
                                <Th label="조회" col="view_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="댓글" col="comment_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="작성일" col="written_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <Th label="수집일" col="created_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <Th label="갱신일" col="updated_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-muted">
                            {communityLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-sm text-content-muted text-center">로딩 중…</td>
                                </tr>
                            ) : !communityResult || communityResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-sm text-content-muted text-center">수집된 게시글이 없습니다</td>
                                </tr>
                            ) : (
                                communityResult.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-2.5 text-sm">
                                            {item.url ? (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer"
                                                    className="text-content-primary hover:text-primary hover:underline line-clamp-1">
                                                    {item.title}
                                                </a>
                                            ) : (
                                                <span className="line-clamp-1">{item.title}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                                item.source_site === '더쿠'
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : item.source_site === '네이트판'
                                                    ? 'bg-purple-100 text-purple-700'
                                                    : item.source_site === '클리앙'
                                                    ? 'bg-green-100 text-green-700'
                                                    : item.source_site === '보배드림'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : item.source_site === '루리웹'
                                                    ? 'bg-red-100 text-red-700'
                                                    : item.source_site === '뽐뿌'
                                                    ? 'bg-yellow-100 text-yellow-700'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {item.source_site}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap max-w-[12rem]">
                                            {item.issues ? (
                                                <Link href={`/issue/${item.issues.id}`}
                                                    className="text-primary hover:underline line-clamp-1 block">
                                                    {item.issues.title}
                                                </Link>
                                            ) : (
                                                <span className="text-border-strong">미연결</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-secondary text-right whitespace-nowrap">
                                            {item.view_count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-secondary text-right whitespace-nowrap">
                                            {item.comment_count.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-muted whitespace-nowrap">
                                            {item.written_at ? fmt(item.written_at) : <span className="text-border-strong">-</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-muted whitespace-nowrap">
                                            {fmt(item.created_at)}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-muted whitespace-nowrap">
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

            {/* ── 트랙 A 검색 뉴스 목록 ── */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-content-primary">트랙 A 검색 뉴스</h2>
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        수시 검색
                    </span>
                    {!newsLoading && newsResult && (
                        <span className="text-xs text-content-muted ml-auto">
                            총 {newsResult.total.toLocaleString()}건
                        </span>
                    )}
                </div>

                <div className="card overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-muted">
                        <thead className="bg-surface-subtle">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted">제목</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted">언론사</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted whitespace-nowrap">검색 키워드</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted whitespace-nowrap w-48">연결 이슈</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted whitespace-nowrap">발행일</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted whitespace-nowrap">수집일</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-muted">
                            {newsLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-sm text-content-muted text-center">로딩 중…</td>
                                </tr>
                            ) : !newsResult || newsResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-sm text-content-muted text-center">수집된 뉴스가 없습니다</td>
                                </tr>
                            ) : (
                                newsResult.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-2.5 text-sm max-w-xs">
                                            {item.link ? (
                                                <a href={item.link} target="_blank" rel="noopener noreferrer"
                                                    className="text-primary hover:underline line-clamp-1">
                                                    {decodeHtml(item.title)}
                                                </a>
                                            ) : (
                                                <span className="line-clamp-1">{decodeHtml(item.title)}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-secondary whitespace-nowrap">{item.source}</td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                            {item.search_keyword
                                                ? <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{item.search_keyword}</span>
                                                : <span className="text-border-strong">-</span>
                                            }
                                        </td>
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                            {item.issues ? (
                                                <Link href={`/issue/${item.issues.id}`} target="_blank"
                                                    className="text-primary hover:underline">
                                                    {item.issues.title}
                                                </Link>
                                            ) : (
                                                <span className="text-border-strong">미연결</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-muted whitespace-nowrap">
                                            {item.published_at ? fmt(item.published_at) : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-content-muted whitespace-nowrap">
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
            </div>
            )}

            </>)}

            {/* ── 이슈 자동화 로그 탭 ─────────────────────── */}
            {pageTab === '이슈 자동화 로그' && (
                <div>
                    {/* 필터 바 */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <select
                            value={pipelineResultFilter}
                            onChange={(e) => {
                                const v = e.target.value as TrackAResult | 'all'
                                setPipelineResultFilter(v)
                                fetchPipelineLogs(v, pipelineDateFilter)
                            }}
                            className="text-sm border border-border rounded-xl px-2 py-1.5 bg-surface"
                        >
                            <option value="all">전체 결과</option>
                            <option value="issue_created">이슈 생성</option>
                            <option value="auto_approved">자동 승인</option>
                            <option value="duplicate_linked">기존 이슈 연결</option>
                            <option value="ai_rejected">AI 검증 실패</option>
                            <option value="no_news">뉴스 없음</option>
                            <option value="no_community">커뮤니티 없음</option>
                            <option value="heat_too_low">화력 미달</option>
                            <option value="no_news_linked">뉴스 연결 실패</option>
                            <option value="no_timeline">타임라인 없음</option>
                            <option value="validation_failed">검증 실패</option>
                            <option value="rate_limited">Rate Limit</option>
                            <option value="error">에러</option>
                        </select>
                        <select
                            value={pipelineDateFilter}
                            onChange={(e) => {
                                setPipelineDateFilter(e.target.value)
                                fetchPipelineLogs(pipelineResultFilter, e.target.value)
                            }}
                            className="text-sm border border-border rounded-xl px-2 py-1.5 bg-surface"
                        >
                            {availableDates.length === 0 ? (
                                <option value={pipelineDateFilter}>{pipelineDateFilter}</option>
                            ) : (
                                availableDates.map((d) => {
                                    const label = new Date(d + 'T00:00:00').toLocaleDateString('ko-KR', {
                                        month: 'long', day: 'numeric', weekday: 'short',
                                    })
                                    return <option key={d} value={d}>{label}</option>
                                })
                            )}
                        </select>
                    </div>

                    {/* 요약 뱃지 */}
                    {pipelineLogs && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Object.entries(pipelineLogs.summary)
                                .sort((a, b) => b[1] - a[1])
                                .map(([result, count]) => {
                                    const RESULT_LABEL: Record<string, string> = {
                                        issue_created: '이슈 생성',
                                        auto_approved: '자동 승인',
                                        duplicate_linked: '기존 연결',
                                        ai_rejected: 'AI 거부',
                                        no_news: '뉴스 없음',
                                        no_community: '커뮤니티 없음',
                                        heat_too_low: '화력 미달',
                                        no_news_linked: '뉴스 연결 실패',
                                        no_timeline: '타임라인 없음',
                                        validation_failed: '검증 실패',
                                        rate_limited: 'Rate Limit',
                                        error: '에러',
                                    }
                                    const RESULT_COLOR: Record<string, string> = {
                                        issue_created: 'bg-green-100 text-green-700',
                                        auto_approved: 'bg-emerald-100 text-emerald-700',
                                        duplicate_linked: 'bg-blue-100 text-blue-700',
                                        ai_rejected: 'bg-orange-100 text-orange-700',
                                        no_news: 'bg-yellow-100 text-yellow-700',
                                        no_community: 'bg-yellow-100 text-yellow-700',
                                        heat_too_low: 'bg-red-100 text-red-700',
                                        no_news_linked: 'bg-red-100 text-red-700',
                                        no_timeline: 'bg-red-100 text-red-700',
                                        validation_failed: 'bg-red-100 text-red-700',
                                        rate_limited: 'bg-purple-100 text-purple-700',
                                        error: 'bg-gray-100 text-gray-700',
                                    }
                                    return (
                                        <span
                                            key={result}
                                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${RESULT_COLOR[result] ?? 'bg-gray-100 text-gray-600'}`}
                                        >
                                            {RESULT_LABEL[result] ?? result} {count}
                                        </span>
                                    )
                                })}
                        </div>
                    )}

                    {/* 로그 목록 */}
                    {pipelineLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-14 bg-surface-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : !pipelineLogs || pipelineLogs.data.length === 0 ? (
                        <div className="card p-10 text-center text-sm text-content-muted">
                            로그가 없습니다.{' '}
                            {pipelineLogs === null && 'track_a_logs 테이블 마이그레이션 후 Track A가 실행되면 기록됩니다.'}
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-subtle border-b border-border-muted">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-36">실행 시각</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-36">키워드</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-content-muted w-16">감지 건수</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-28">결과</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-48">상세</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-muted">
                                    {pipelineLogs.data.map((log) => {
                                        const RESULT_LABEL: Record<string, string> = {
                                            issue_created: '이슈 생성',
                                            auto_approved: '자동 승인',
                                            duplicate_linked: '기존 연결',
                                            ai_rejected: 'AI 거부',
                                            no_news: '뉴스 없음',
                                            no_community: '커뮤니티 없음',
                                            heat_too_low: '화력 미달',
                                            no_news_linked: '뉴스 연결 실패',
                                            no_timeline: '타임라인 없음',
                                            validation_failed: '검증 실패',
                                            rate_limited: 'Rate Limit',
                                            error: '에러',
                                        }
                                        const RESULT_COLOR: Record<string, string> = {
                                            issue_created: 'bg-green-100 text-green-700',
                                            auto_approved: 'bg-emerald-100 text-emerald-700',
                                            duplicate_linked: 'bg-blue-100 text-blue-700',
                                            ai_rejected: 'bg-orange-100 text-orange-700',
                                            no_news: 'bg-yellow-100 text-yellow-700',
                                            no_community: 'bg-yellow-100 text-yellow-700',
                                            heat_too_low: 'bg-red-100 text-red-700',
                                            no_news_linked: 'bg-red-100 text-red-700',
                                            no_timeline: 'bg-red-100 text-red-700',
                                            validation_failed: 'bg-red-100 text-red-700',
                                            rate_limited: 'bg-purple-100 text-purple-700',
                                            error: 'bg-gray-100 text-gray-700',
                                        }
                                        const detail = log.details
                                        const detailText = detail
                                            ? [
                                                detail.aiConfidence !== undefined && `AI 신뢰도 ${detail.aiConfidence}%`,
                                                detail.reason && `사유: ${detail.reason}`,
                                                detail.newsCount !== undefined && `뉴스 ${detail.newsCount}건`,
                                                detail.heatIndex !== undefined && `화력 ${detail.heatIndex}점`,
                                                detail.communityLinked !== undefined && `커뮤니티 ${detail.communityLinked}건 연결`,
                                                detail.existingIssueTitle && `→ "${detail.existingIssueTitle}"`,
                                                detail.finalIssueTitle && `"${detail.finalIssueTitle}"`,
                                                detail.error && `오류: ${detail.error}`,
                                            ].filter(Boolean).join(' · ')
                                            : ''
                                        return (
                                            <tr key={log.id} className="hover:bg-surface-subtle">
                                                <td className="px-4 py-3 text-xs text-content-muted whitespace-nowrap">
                                                    {new Date(log.run_at).toLocaleString('ko-KR', {
                                                        month: '2-digit', day: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-content-primary">
                                                    {log.keyword}
                                                </td>
                                                <td className="px-4 py-3 text-center text-content-secondary">
                                                    {log.burst_count}건
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLOR[log.result] ?? 'bg-surface-muted text-content-secondary'}`}>
                                                        {RESULT_LABEL[log.result] ?? log.result}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-content-secondary w-48">
                                                    {log.issues ? (
                                                        <Link
                                                            href={`/admin/issues/${log.issue_id}`}
                                                            className="text-primary hover:underline"
                                                        >
                                                            {log.issues.title}
                                                        </Link>
                                                    ) : detailText}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
