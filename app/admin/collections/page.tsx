/**
 * app/admin/collections/page.tsx
 * [관리자 - 수집 현황 페이지]
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CollectionStats {
    news: {
        total: number
        byCategory: Record<string, number>
        last24h: Record<string, number>
        linked: number
        recent: Array<{
            id: string
            title: string
            link: string | null
            source: string
            published_at: string | null
            created_at: string
            issue_id: string | null
            issues: { id: string; title: string } | null
        }>
    }
    community: {
        total: number
        bySite: Record<string, number>
        last24h: Record<string, number>
        linked: number
        recent: Array<{
            id: string
            title: string
            source_site: string
            view_count: number
            comment_count: number
            written_at: string
            url: string | null
            issue_id: string | null
            issues: { id: string; title: string } | null
        }>
    }
}

type CommunityTab = '전체' | '더쿠' | '네이트판'

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
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-2 align-middle">
            {label}
        </span>
    )
}

export default function AdminCollectionsPage() {
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [communityTab, setCommunityTab] = useState<CommunityTab>('전체')

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await fetch('/api/admin/collections')
            if (!response.ok) throw new Error('통계 조회 실패')
            const data = await response.json()
            setStats(data)
            setLastRefreshedAt(new Date())
        } catch (err) {
            setError(err instanceof Error ? err.message : '오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const decodeHtml = (str: string) => {
        if (typeof document === 'undefined') return str
        const txt = document.createElement('textarea')
        txt.innerHTML = str
        return txt.value
    }

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

    const total24h = (record: Record<string, number>) =>
        Object.values(record).reduce((a, b) => a + b, 0)

    const filteredCommunity = (items: CollectionStats['community']['recent']) => {
        const filtered = communityTab === '전체' ? items : items.filter((item) => item.source_site === communityTab)
        return [...filtered].sort((a, b) => new Date(b.written_at).getTime() - new Date(a.written_at).getTime())
    }

    const TABS: CommunityTab[] = ['전체', '더쿠', '네이트판']

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">
                        ← 관리자 홈
                    </Link>
                    <h1 className="text-2xl font-bold mt-1">수집 현황</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            갱신 {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchStats}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? '로딩 중…' : '새로고침'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                    {error}
                </div>
            )}

            {stats && (
                <>
                    {/* 요약 통계 카드 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="뉴스 총 수집"
                                value={stats.news.total}
                                sub={`24h +${total24h(stats.news.last24h)}`}
                            />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="뉴스 이슈 연결"
                                value={stats.news.linked}
                                sub={stats.news.total ? `${Math.round((stats.news.linked / stats.news.total) * 100)}%` : '-'}
                            />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="커뮤니티 총 수집"
                                value={stats.community.total}
                                sub={`24h +${total24h(stats.community.last24h)}`}
                            />
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <StatCard
                                label="커뮤니티 이슈 연결"
                                value={stats.community.linked}
                                sub={stats.community.total ? `${Math.round((stats.community.linked / stats.community.total) * 100)}%` : '-'}
                            />
                        </div>
                    </div>

                    {/* 사이트별 수집 현황 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* 뉴스 출처별 */}
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700">
                                    뉴스 출처별 수집
                                </h2>
                                <CronBadge label="30분 주기" />
                            </div>
                            {Object.keys(stats.news.byCategory).length === 0 ? (
                                <p className="text-sm text-gray-400">수집 데이터 없음</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(stats.news.byCategory)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 8)
                                        .map(([source, count]) => (
                                            <div key={source} className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-28 truncate">{source}</span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-blue-500 h-1.5 rounded-full"
                                                        style={{ width: `${Math.min(100, (count / stats.news.total) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* 커뮤니티 사이트별 */}
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700">
                                    커뮤니티 사이트별 수집
                                </h2>
                                <CronBadge label="3분 주기" />
                            </div>
                            {Object.keys(stats.community.bySite).length === 0 ? (
                                <p className="text-sm text-gray-400">수집 데이터 없음</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(stats.community.bySite)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([site, count]) => (
                                            <div key={site} className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-20">{site}</span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-purple-500 h-1.5 rounded-full"
                                                        style={{ width: `${Math.min(100, (count / stats.community.total) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 최근 수집 뉴스 */}
                    <section className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-base font-semibold text-gray-800">최근 수집 뉴스</h2>
                            <span className="text-xs text-gray-400 font-normal">네이버 뉴스 API</span>
                            <CronBadge label="30분 주기" />
                        </div>
                        <div className="bg-white border rounded-lg overflow-hidden">
                            {stats.news.recent.length === 0 ? (
                                <p className="px-4 py-6 text-sm text-gray-400 text-center">수집된 뉴스가 없습니다</p>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-full">제목</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">출처</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">연결 이슈</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">발행일</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">수집</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {stats.news.recent.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 text-sm max-w-xs">
                                                    {item.link ? (
                                                        <a
                                                            href={item.link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:underline line-clamp-1"
                                                        >
                                                            {decodeHtml(item.title)}
                                                        </a>
                                                    ) : (
                                                        <span className="line-clamp-1">{decodeHtml(item.title)}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{item.source}</td>
                                                <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                                    {item.issues ? (
                                                        <Link
                                                            href={`/issue/${item.issues.id}`}
                                                            target="_blank"
                                                            className="text-blue-600 hover:underline line-clamp-1"
                                                        >
                                                            {item.issues.title}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-gray-300">미연결</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                                    {item.published_at ? formatDate(item.published_at) : '-'}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                                    {formatDate(item.created_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>

                    {/* 최근 수집 커뮤니티 */}
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-base font-semibold text-gray-800">최근 수집 커뮤니티</h2>
                            <CronBadge label="3분 주기" />
                        </div>

                        {/* 더쿠 / 네이트판 탭 */}
                        <div className="flex gap-1 mb-3">
                            {TABS.map((tab) => {
                                const count =
                                    tab === '전체'
                                        ? stats.community.recent.length
                                        : stats.community.recent.filter((i) => i.source_site === tab).length
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setCommunityTab(tab)}
                                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                                            communityTab === tab
                                                ? 'bg-gray-900 text-white border-gray-900'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                        }`}
                                    >
                                        {tab}
                                        <span className={`ml-1 text-xs ${communityTab === tab ? 'text-gray-300' : 'text-gray-400'}`}>
                                            {count}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        <div className="bg-white border rounded-lg overflow-hidden">
                            {filteredCommunity(stats.community.recent).length === 0 ? (
                                <p className="px-4 py-6 text-sm text-gray-400 text-center">수집된 게시글이 없습니다</p>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-full">제목</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">사이트</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">연결 이슈</th>
                                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">조회</th>
                                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">댓글</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">작성일</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredCommunity(stats.community.recent).map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 text-sm max-w-xs">
                                                    {item.url ? (
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-gray-900 hover:text-blue-600 hover:underline line-clamp-1"
                                                        >
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
                                                <td className="px-4 py-2.5 text-xs">
                                                    {item.issues ? (
                                                        <Link
                                                            href={`/issues/${item.issues.id}`}
                                                            className="text-blue-600 hover:underline line-clamp-1"
                                                        >
                                                            {item.issues.title}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-gray-300">미연결</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-500 text-right">
                                                    {item.view_count.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-500 text-right">
                                                    {item.comment_count.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                                                    {formatDate(item.written_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    )
}
