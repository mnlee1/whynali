/**
 * app/admin/(protected)/monitoring/page.tsx
 *
 * [시스템 모니터링 페이지]
 * Supabase 사용량, DB 크기, 트래픽 통계, 유저 지표 확인
 */

'use client'

import { useState, useEffect } from 'react'
import { Database, AlertTriangle } from 'lucide-react'

interface MonitoringData {
    instance: {
        name: string
        url: string
        isProduction: boolean
        isDevelopment: boolean
    }
    database: {
        estimatedSizeMB: number
        limitMB: number
        usagePercent: number
    }
    storage: {
        usedMB: number
        limitMB: number
        usagePercent: number
    }
    users: {
        mau: number
        mauLimit: number
        mauPercent: number
    }
    cleanup: {
        oldNews: number
        oldCommunity: number
        total: number
    }
    warnings: Array<{
        type: string
        severity: 'warning' | 'critical'
        message: string
    }>
}



export default function MonitoringPage() {
    const [data, setData] = useState<MonitoringData | null>(null)
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/monitoring', { cache: 'no-store' })
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
                {lastUpdated && (
                    <span className="text-sm text-content-muted">
                        {lastUpdated.toLocaleTimeString('ko-KR')} 기준
                    </span>
                )}
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

            {/* DB 사용량 */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Database className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-content-primary">
                        Supabase 사용량
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* DB */}
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">DB (추정)</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.database.estimatedSizeMB}
                            <span className="text-sm font-normal text-content-muted ml-1">MB</span>
                        </p>
                        <p className="text-xs text-content-muted mt-1">
                            한도 {data.database.limitMB}MB ({data.database.usagePercent}%)
                        </p>
                        <div className="mt-2 w-full bg-surface-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${
                                    data.database.usagePercent > 90 ? 'bg-red-500'
                                    : data.database.usagePercent > 70 ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${data.database.usagePercent}%` }}
                            />
                        </div>
                    </div>

                    {/* 스토리지 */}
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">스토리지</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.storage.usedMB}
                            <span className="text-sm font-normal text-content-muted ml-1">MB</span>
                        </p>
                        <p className="text-xs text-content-muted mt-1">
                            한도 {data.storage.limitMB}MB ({data.storage.usagePercent}%)
                        </p>
                        <div className="mt-2 w-full bg-surface-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${
                                    data.storage.usagePercent > 90 ? 'bg-red-500'
                                    : data.storage.usagePercent > 70 ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${data.storage.usagePercent}%` }}
                            />
                        </div>
                    </div>

                    {/* MAU */}
                    <div className="p-4 bg-surface-subtle rounded-xl">
                        <p className="text-sm text-content-muted mb-1">MAU</p>
                        <p className="text-2xl font-bold text-content-primary">
                            {data.users.mau.toLocaleString()}
                            <span className="text-sm font-normal text-content-muted ml-1">명</span>
                        </p>
                        <p className="text-xs text-content-muted mt-1">
                            한도 {data.users.mauLimit.toLocaleString()}명 ({data.users.mauPercent}%)
                        </p>
                        <div className="mt-2 w-full bg-surface-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${
                                    data.users.mauPercent > 90 ? 'bg-red-500'
                                    : data.users.mauPercent > 70 ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${data.users.mauPercent}%` }}
                            />
                        </div>
                    </div>
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
