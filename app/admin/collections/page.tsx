/**
 * app/admin/collections/page.tsx
 *
 * [관리자 - 수집 현황 페이지]
 *
 * 뉴스·커뮤니티 수집 통계와 목록을 보여줍니다.
 * 컬럼 헤더 클릭 소팅, 연결/미연결/전체 탭 필터, 페이지네이션을 지원합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ─── 타입 ────────────────────────────────────────────────

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
type CommunitySort = 'written_at' | 'created_at' | 'view_count' | 'comment_count' | 'source_site'
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
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

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

    const fetchStats = async () => {
        setStatsLoading(true)
        try {
            const res = await fetch('/api/admin/collections')
            if (!res.ok) return
            setStats(await res.json())
            setLastRefreshedAt(new Date())
        } finally {
            setStatsLoading(false)
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

    const fmt = (d: string) =>
        new Date(d).toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })

    const total24h = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

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

    return (
        <div>

            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">수집 현황</h1>
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

            {/* 요약 통계 카드 */}
            {stats && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard label="뉴스 총 수집" value={stats.news.total} sub={`24h +${total24h(stats.news.last24h)}`} />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="뉴스 이슈 연결"
                                value={stats.news.linked}
                                sub={stats.news.total ? `${Math.round((stats.news.linked / stats.news.total) * 100)}%` : '-'}
                            />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard label="커뮤니티 총 수집" value={stats.community.total} sub={`24h +${total24h(stats.community.last24h)}`} />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="커뮤니티 이슈 연결"
                                value={stats.community.linked}
                                sub={stats.community.total ? `${Math.round((stats.community.linked / stats.community.total) * 100)}%` : '-'}
                            />
                        </div>
                    </div>

                    {/* 출처별 수집 현황 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700">뉴스 출처별 수집</h2>
                                <CronBadge label="30분 주기" />
                            </div>
                            {Object.keys(stats.news.byCategory).length === 0 ? (
                                <p className="text-sm text-gray-400">수집 데이터 없음</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(stats.news.byCategory)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 8)
                                        .map(([src, cnt]) => (
                                            <div key={src} className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-28 truncate">{src}</span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-blue-500 h-1.5 rounded-full"
                                                        style={{ width: `${Math.min(100, (cnt / stats.news.total) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 w-8 text-right">{cnt}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700">커뮤니티 사이트별 수집</h2>
                                <CronBadge label="3분 주기" />
                            </div>
                            {Object.keys(stats.community.bySite).length === 0 ? (
                                <p className="text-sm text-gray-400">수집 데이터 없음</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(stats.community.bySite)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([site, cnt]) => (
                                            <div key={site} className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-20">{site}</span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-purple-500 h-1.5 rounded-full"
                                                        style={{ width: `${Math.min(100, (cnt / stats.community.total) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 w-8 text-right">{cnt}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── 수집 뉴스 목록 ── */}
            <section className="mb-10">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-gray-800">수집 뉴스</h2>
                    <CronBadge label="30분 주기" />
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
                                    연결 이슈
                                </th>
                                <Th label="발행일" col="published_at" activeCol={newsSort} activeOrder={newsOrder} onSort={handleNewsSort} />
                                <Th label="수집일" col="created_at" activeCol={newsSort} activeOrder={newsOrder} onSort={handleNewsSort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {newsLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-sm text-gray-400 text-center">로딩 중…</td>
                                </tr>
                            ) : !newsResult || newsResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-sm text-gray-400 text-center">수집된 뉴스가 없습니다</td>
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
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-full">제목</th>
                                <Th label="사이트" col="source_site" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">연결 이슈</th>
                                <Th label="조회" col="view_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="댓글" col="comment_count" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} className="text-right" />
                                <Th label="작성일" col="written_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                                <Th label="수집일" col="created_at" activeCol={communitySort} activeOrder={communityOrder} onSort={handleCommunitySort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {communityLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-sm text-gray-400 text-center">로딩 중…</td>
                                </tr>
                            ) : !communityResult || communityResult.data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-sm text-gray-400 text-center">수집된 게시글이 없습니다</td>
                                </tr>
                            ) : (
                                communityResult.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 text-sm max-w-xs">
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
                                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                            {item.issues ? (
                                                <Link href={`/issue/${item.issues.id}`}
                                                    className="text-blue-600 hover:underline line-clamp-1">
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
    )
}
