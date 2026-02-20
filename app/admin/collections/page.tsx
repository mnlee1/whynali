/**
 * app/admin/collections/page.tsx
 * 
 * [관리자 - 수집 현황 페이지]
 * 
 * 뉴스·커뮤니티 수집 통계와 최근 데이터를 표시합니다.
 */

'use client'

import { useState, useEffect } from 'react'

interface CollectionStats {
    news: {
        total: number
        byCategory: Record<string, number>
        last24h: Record<string, number>
        linked: number
        recent: Array<{
            id: string
            title: string
            source: string
            category: string
            created_at: string
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
            site: string
            view_count: number
            comment_count: number
            scraped_at: string
        }>
    }
}

export default function AdminCollectionsPage() {
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/admin/collections')
            if (!response.ok) throw new Error('통계 조회 실패')
            const data = await response.json()
            setStats(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : '오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-gray-500">로딩 중...</p>
            </div>
        )
    }

    if (error || !stats) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-red-600">{error || '데이터를 불러올 수 없습니다'}</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">수집 현황</h1>
                <button
                    onClick={fetchStats}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    새로고침
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* 뉴스 통계 */}
                <div className="border rounded-lg p-6 bg-white">
                    <h2 className="text-xl font-bold mb-4">뉴스 수집</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600">총 수집</p>
                            <p className="text-3xl font-bold">{stats.news.total}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 mb-2">24시간 수집</p>
                            {Object.entries(stats.news.last24h).map(([cat, count]) => (
                                <div key={cat} className="flex justify-between text-sm">
                                    <span>{cat}</span>
                                    <span className="font-semibold">{count}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">이슈 연결</p>
                            <p className="text-2xl font-bold text-green-600">{stats.news.linked}</p>
                        </div>
                    </div>
                </div>

                {/* 커뮤니티 통계 */}
                <div className="border rounded-lg p-6 bg-white">
                    <h2 className="text-xl font-bold mb-4">커뮤니티 수집</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600">총 수집</p>
                            <p className="text-3xl font-bold">{stats.community.total}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 mb-2">24시간 수집</p>
                            {Object.entries(stats.community.last24h).map(([site, count]) => (
                                <div key={site} className="flex justify-between text-sm">
                                    <span>{site}</span>
                                    <span className="font-semibold">{count}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">이슈 연결</p>
                            <p className="text-2xl font-bold text-green-600">
                                {stats.community.linked}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 최근 뉴스 */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">최근 수집 뉴스</h2>
                <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    제목
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    출처
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    카테고리
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    수집 시간
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {stats.news.recent.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm">{item.title}</td>
                                    <td className="px-4 py-3 text-sm">{item.source}</td>
                                    <td className="px-4 py-3 text-sm">{item.category}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {formatDate(item.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 최근 커뮤니티 */}
            <div>
                <h2 className="text-xl font-bold mb-4">최근 수집 커뮤니티</h2>
                <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    제목
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    사이트
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    조회수
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    댓글
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    수집 시간
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {stats.community.recent.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm">{item.title}</td>
                                    <td className="px-4 py-3 text-sm">{item.site}</td>
                                    <td className="px-4 py-3 text-sm">{item.view_count}</td>
                                    <td className="px-4 py-3 text-sm">{item.comment_count}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {formatDate(item.scraped_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
