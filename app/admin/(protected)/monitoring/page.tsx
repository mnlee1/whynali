/**
 * app/admin/(protected)/monitoring/page.tsx
 *
 * [시스템 모니터링 페이지]
 * Supabase 사용량, DB 크기, 트래픽 통계, 유저 지표 확인
 */

'use client'

import { useState, useEffect } from 'react'
import { Database, Activity, AlertTriangle, TrendingUp, Users, Eye } from 'lucide-react'
import Link from 'next/link'

interface TableCount {
    table: string
    count: number
}

interface MonitoringData {
    instance: {
        name: string
        url: string
        isProduction: boolean
        isDevelopment: boolean
    }
    tables: TableCount[]
    activity24h: {
        issues: number
        comments: number
        reactions: number
        news: number
    }
    users: {
        total: number
        newToday: number
        newThisWeek: number
        newThisMonth: number
        dau: number
        wau: number
        mau: number
        mauLimit: number
        mauPercent: number
    }
    traffic: {
        topIssues: Array<{
            id: string
            title: string
            view_count: number
            heat_index: number
            category: string
            status: string
        }>
        categoryDistribution: Record<string, number>
        engagementRate: number
    }
    cleanup: {
        oldNews: number
        oldCommunity: number
        total: number
    }
    database: {
        estimatedSizeMB: number
        totalRows: number
        limitMB: number
        usagePercent: number
    }
    warnings: Array<{
        type: string
        severity: 'warning' | 'critical'
        message: string
    }>
}

const TABLE_LABELS: Record<string, string> = {
    issues: '이슈',
    news_data: '뉴스 데이터',
    community_data: '커뮤니티 데이터',
    timeline_points: '타임라인 포인트',
    comments: '댓글',
    reactions: '반응',
    votes: '투표',
    discussion_topics: '토론 주제',
    users: '사용자',
    admin_logs: '관리자 로그',
}

const CATEGORY_COLORS: Record<string, string> = {
    '연예': 'bg-pink-100 text-pink-700',
    '스포츠': 'bg-green-100 text-green-700',
    '정치': 'bg-blue-100 text-blue-700',
    '사회': 'bg-gray-100 text-gray-700',
    '경제': 'bg-yellow-100 text-yellow-700',
    'IT과학': 'bg-purple-100 text-purple-700',
    '생활문화': 'bg-orange-100 text-orange-700',
    '세계': 'bg-indigo-100 text-indigo-700',
}

export default function MonitoringPage() {
    const [data, setData] = useState<MonitoringData | null>(null)
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/monitoring')
            if (res.ok) {
                const json = await res.json()
                setData(json)
                setLastUpdated(new Date())
            }
        } catch (error) {
            console.error('[Monitoring] 데이터 로드 에러:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    if (loading && !data) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-content-primary">시스템 모니터링</h1>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-32 bg-surface-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-content-primary">시스템 모니터링</h1>
                <div className="card p-8 text-center">
                    <p className="text-content-muted">데이터를 불러올 수 없습니다</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">시스템 모니터링</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                data.instance.isProduction
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-blue-100 text-blue-700'
                            }`}
                        >
                            {data.instance.name}
                        </span>
                        <span className="text-xs text-content-muted">
                            {data.instance.url.replace('https://', '')}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-sm text-content-muted">
                            마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
                        </span>
                    )}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm font-medium bg-surface-subtle hover:bg-surface-muted border border-border rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? '새로고침 중...' : '새로고침'}
                    </button>
                </div>
            </div>

            {/* 경고 배너 */}
            {data.warnings.length > 0 && (
                <div className="space-y-2">
                    {data.warnings.map((warning, idx) => (
                        <div
                            key={idx}
                            className={`flex items-start gap-3 p-4 rounded-xl border ${
                                warning.severity === 'critical'
                                    ? 'bg-red-50 border-red-300'
                                    : 'bg-yellow-50 border-yellow-300'
                            }`}
                        >
                            <AlertTriangle
                                className={`w-5 h-5 shrink-0 mt-0.5 ${
                                    warning.severity === 'critical'
                                        ? 'text-red-600'
                                        : 'text-yellow-600'
                                }`}
                            />
                            <p
                                className={`text-sm flex-1 ${
                                    warning.severity === 'critical'
                                        ? 'text-red-800'
                                        : 'text-yellow-800'
                                }`}
                            >
                                {warning.message}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* 유저 지표 */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-content-primary">유저 지표</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">총 가입자</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.users.total.toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">오늘 신규</p>
                        <p className="text-2xl font-bold text-green-600">
                            +{data.users.newToday}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">이번 주 신규</p>
                        <p className="text-2xl font-bold text-green-600">
                            +{data.users.newThisWeek}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">이번 달 신규</p>
                        <p className="text-2xl font-bold text-green-600">
                            +{data.users.newThisMonth}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <p className="text-sm text-content-muted mb-1">일일 활성 유저 (DAU)</p>
                        <p className="text-2xl font-bold text-blue-700">
                            {data.users.dau.toLocaleString()}
                        </p>
                        <p className="text-xs text-content-muted mt-1">
                            최근 24시간 활동 유저
                        </p>
                    </div>
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                        <p className="text-sm text-content-muted mb-1">주간 활성 유저 (WAU)</p>
                        <p className="text-2xl font-bold text-indigo-700">
                            {data.users.wau.toLocaleString()}
                        </p>
                        <p className="text-xs text-content-muted mt-1">최근 7일 활동 유저</p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                        <p className="text-sm text-content-muted mb-1">
                            월간 활성 유저 (MAU)
                        </p>
                        <p className="text-2xl font-bold text-purple-700">
                            {data.users.mau.toLocaleString()}
                        </p>
                        <p className="text-xs text-content-muted mt-1">
                            무료 플랜: {data.users.mauLimit.toLocaleString()}명 (
                            {data.users.mauPercent}%)
                        </p>
                        <div className="mt-2 w-full bg-surface-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${
                                    data.users.mauPercent > 90
                                        ? 'bg-red-500'
                                        : data.users.mauPercent > 70
                                        ? 'bg-yellow-500'
                                        : 'bg-green-500'
                                }`}
                                style={{ width: `${data.users.mauPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 인기 이슈 Top 5 */}
            {data.traffic.topIssues.length > 0 && (
                <div className="card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Eye className="w-5 h-5 text-purple-600" />
                        <h2 className="text-lg font-semibold text-content-primary">
                            인기 이슈 Top 5
                        </h2>
                    </div>

                    <div className="space-y-2">
                        {data.traffic.topIssues.map((issue, idx) => (
                            <Link
                                key={issue.id}
                                href={`/issue/${issue.id}`}
                                target="_blank"
                                className="flex items-center gap-3 p-3 bg-surface-subtle hover:bg-surface-muted rounded-lg transition-colors"
                            >
                                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center font-bold text-content-muted text-sm">
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-content-primary truncate">
                                        {issue.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${
                                                CATEGORY_COLORS[issue.category] || ''
                                            }`}
                                        >
                                            {issue.category}
                                        </span>
                                        <span className="text-xs text-content-muted">
                                            화력 {issue.heat_index.toFixed(1)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                    <p className="text-lg font-bold text-content-primary">
                                        {issue.view_count.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-content-muted">조회</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* 카테고리별 이슈 분포 */}
            {Object.keys(data.traffic.categoryDistribution).length > 0 && (
                <div className="card p-6">
                    <h2 className="text-lg font-semibold text-content-primary mb-4">
                        카테고리별 이슈 분포
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(data.traffic.categoryDistribution)
                            .sort(([, a], [, b]) => b - a)
                            .map(([category, count]) => (
                                <div
                                    key={category}
                                    className="p-3 bg-surface-subtle rounded-lg"
                                >
                                    <p className="text-sm text-content-muted mb-1">
                                        {category}
                                    </p>
                                    <p className="text-xl font-bold text-content-primary">
                                        {count}
                                    </p>
                                </div>
                            ))}
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800">
                            평균 참여도 (이슈당 댓글+반응):{' '}
                            <span className="font-bold">
                                {data.traffic.engagementRate.toFixed(1)}
                            </span>
                        </p>
                    </div>
                </div>
            )}

            {/* DB 사용량 */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Database className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-content-primary">
                        데이터베이스 사용량
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">추정 크기</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.database.estimatedSizeMB}
                            <span className="text-sm font-normal text-content-muted ml-1">
                                MB
                            </span>
                        </p>
                        <p className="text-xs text-content-muted mt-1">무료 플랜: 500MB</p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">사용률</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.database.usagePercent}
                            <span className="text-sm font-normal text-content-muted ml-1">
                                %
                            </span>
                        </p>
                        <div className="mt-2 w-full bg-surface-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${
                                    data.database.usagePercent > 90
                                        ? 'bg-red-500'
                                        : data.database.usagePercent > 70
                                        ? 'bg-yellow-500'
                                        : 'bg-green-500'
                                }`}
                                style={{ width: `${data.database.usagePercent}%` }}
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">전체 Row 수</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.database.totalRows.toLocaleString()}
                        </p>
                    </div>
                </div>

                <p className="text-xs text-content-muted p-3 bg-blue-50 rounded-lg border border-blue-200">
                    추정치는 평균 row 크기를 1KB로 가정한 값입니다. 정확한 DB 크기는{' '}
                    <a
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                    >
                        Supabase Dashboard
                    </a>
                    에서 확인하세요.
                </p>
            </div>

            {/* 24시간 활동 */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Activity className="w-5 h-5 text-green-600" />
                    <h2 className="text-lg font-semibold text-content-primary">
                        최근 24시간 활동
                    </h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">신규 이슈</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.activity24h.issues}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">댓글</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.activity24h.comments}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">반응</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.activity24h.reactions}
                        </p>
                    </div>
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">수집 뉴스</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.activity24h.news}
                        </p>
                    </div>
                </div>
            </div>

            {/* 테이블별 통계 */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-semibold text-content-primary">
                        테이블별 데이터
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">
                                    테이블
                                </th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">
                                    Row 수
                                </th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">
                                    비율
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.tables
                                .sort((a, b) => b.count - a.count)
                                .map((table) => {
                                    const percent =
                                        (table.count / data.database.totalRows) * 100
                                    return (
                                        <tr
                                            key={table.table}
                                            className="hover:bg-surface-subtle"
                                        >
                                            <td className="px-4 py-3 text-sm text-content-primary">
                                                {TABLE_LABELS[table.table] || table.table}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-content-secondary text-right font-mono">
                                                {table.count.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-content-muted text-right">
                                                {percent.toFixed(1)}%
                                            </td>
                                        </tr>
                                    )
                                })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 정리 필요 데이터 */}
            {data.cleanup.total > 0 && (
                <div className="card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <h2 className="text-lg font-semibold text-content-primary">
                            정리 필요 데이터
                        </h2>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    3개월 이상 된 미연결 뉴스
                                </p>
                                <p className="text-xs text-content-muted mt-1">
                                    이슈와 연결되지 않은 오래된 뉴스 데이터
                                </p>
                            </div>
                            <p className="text-2xl font-bold text-orange-700">
                                {data.cleanup.oldNews.toLocaleString()}
                            </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    3개월 이상 된 미연결 커뮤니티 데이터
                                </p>
                                <p className="text-xs text-content-muted mt-1">
                                    이슈와 연결되지 않은 오래된 커뮤니티 데이터
                                </p>
                            </div>
                            <p className="text-2xl font-bold text-orange-700">
                                {data.cleanup.oldCommunity.toLocaleString()}
                            </p>
                        </div>

                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm text-blue-800">
                                이 데이터들을 정리하면 약{' '}
                                <span className="font-bold">
                                    {Math.round((data.cleanup.total * 1) / 1024)} MB
                                </span>{' '}
                                의 공간을 확보할 수 있습니다.
                            </p>
                            <p className="text-xs text-blue-700 mt-2">
                                정리 작업은 매주 일요일 오전 3시에 자동으로 실행됩니다.
                                (cleanup-unlinked cron)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 외부 대시보드 링크 */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-content-primary mb-3">
                    추가 모니터링
                </h2>
                <div className="space-y-2">
                    <a
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 bg-surface-subtle hover:bg-surface-muted rounded-lg border border-border transition-colors"
                    >
                        <div>
                            <p className="text-sm font-medium text-content-primary">
                                Supabase Dashboard
                            </p>
                            <p className="text-xs text-content-muted mt-1">
                                정확한 DB 크기, Egress, 연결 수, 실시간 쿼리 확인
                            </p>
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-4 h-4 text-content-muted"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </a>
                    <a
                        href="https://vercel.com/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 bg-surface-subtle hover:bg-surface-muted rounded-lg border border-border transition-colors"
                    >
                        <div>
                            <p className="text-sm font-medium text-content-primary">
                                Vercel Dashboard
                            </p>
                            <p className="text-xs text-content-muted mt-1">
                                서버리스 함수 실행 시간, 에러 로그, 배포 상태
                            </p>
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-4 h-4 text-content-muted"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </a>
                </div>
            </div>
        </div>
    )
}
