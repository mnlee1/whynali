/**
 * app/admin/issues/page.tsx
 * 
 * [관리자 - 이슈 관리 페이지]
 * 
 * 이슈 승인·거부·수정·삭제 기능을 제공합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import type { Issue } from '@/types/issue'
import IssuePreviewDrawer from '@/components/admin/IssuePreviewDrawer'

interface CandidateAlert {
    title: string
    count: number
    newsCount: number
    communityCount: number
}

export default function AdminIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<string>('대기')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [alerts, setAlerts] = useState<CandidateAlert[]>([])
    const [alertsDismissed, setAlertsDismissed] = useState(false)
    const [showHeatGuide, setShowHeatGuide] = useState(false)
    const [previewIssue, setPreviewIssue] = useState<Issue | null>(null)

    useEffect(() => {
        fetchIssues()
    }, [filter])

    useEffect(() => {
        fetchAlerts()
    }, [])

    const fetchAlerts = async () => {
        try {
            const response = await fetch('/api/admin/candidates')
            if (!response.ok) return
            const data = await response.json()
            setAlerts(data.alerts ?? [])
        } catch {
            // 알람 조회 실패는 무시 (부가 기능)
        }
    }

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '승인': 1, '반려': 2 }

    const fetchIssues = async () => {
        try {
            setLoading(true)
            const url = filter
                ? `/api/admin/issues?approval_status=${filter}`
                : '/api/admin/issues'
            const response = await fetch(url)
            if (!response.ok) throw new Error('이슈 조회 실패')
            const data = await response.json()
            const list: Issue[] = data.data ?? []
            if (!filter) {
                list.sort((a, b) =>
                    (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9)
                )
            }
            setIssues(list)
            setLastRefreshedAt(new Date())
        } catch (err) {
            setError(err instanceof Error ? err.message : '오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (id: string) => {
        if (!confirm('이 이슈를 승인하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/approve`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('승인 실패')
            alert('승인되었습니다')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '승인 실패')
        }
    }

    const handleReject = async (id: string) => {
        if (!confirm('이 이슈를 거부하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/reject`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('거부 실패')
            alert('거부되었습니다')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '거부 실패')
        }
    }

    const handleRestore = async (id: string) => {
        if (!confirm('이 이슈를 대기 상태로 복구하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/restore`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('복구 실패')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '복구 실패')
        }
    }

    const handleHide = async (id: string) => {
        if (!confirm('승인된 이슈를 숨김 처리하시겠습니까?\n이슈가 목록에서 노출되지 않습니다.')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/hide`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('숨김 실패')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '숨김 실패')
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

    const APPROVAL_DISPLAY: Record<string, string> = {
        '대기': '대기',
        '승인': '승인',
        '반려': '반려',
    }

    const getHeatMeta = (heat: number | null | undefined): { label: string; className: string } => {
        if (heat == null) return { label: '-', className: 'text-gray-400' }
        if (heat >= 70) return { label: `${heat} 높음`, className: 'font-semibold text-red-600' }
        if (heat >= 30) return { label: `${heat} 보통`, className: 'font-medium text-amber-600' }
        return { label: `${heat} 낮음`, className: 'text-gray-400' }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case '승인':
                return 'bg-green-100 text-green-700'
            case '대기':
                return 'bg-yellow-100 text-yellow-700'
            case '반려':
                return 'bg-red-100 text-red-700'
            default:
                return 'bg-gray-100 text-gray-700'
        }
    }

    if (loading) {
        return (
            <div>
                <p className="text-gray-500">로딩 중...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div>
                <p className="text-red-600">{error}</p>
            </div>
        )
    }

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">이슈 관리</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchIssues}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 이슈 후보 알람 배너 (5건 이상 후보 존재 시 표시) */}
            {alerts.length > 0 && !alertsDismissed && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-800 mb-2">
                                수집 데이터 기반 이슈 후보 {alerts.length}건 — 즉시 처리 필요
                            </p>
                            <ul className="space-y-1">
                                {alerts.map((alert, i) => (
                                    <li key={i} className="text-sm text-amber-700">
                                        <span className="font-medium">{alert.title}</span>
                                        <span className="ml-2 text-amber-500 text-xs">
                                            최근 3시간 {alert.count}건 (뉴스 {alert.newsCount} + 커뮤니티 {alert.communityCount})
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

            {/* 필터 + 화력 기준 안내 토글 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex gap-2">
                    {[
                        { value: '', label: '전체' },
                        { value: '대기', label: '대기' },
                        { value: '승인', label: '승인' },
                        { value: '반려', label: '반려' },
                    ].map(({ value, label }) => (
                        <button
                            key={label}
                            onClick={() => setFilter(value)}
                            className={`px-4 py-2 rounded ${
                                filter === value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowHeatGuide((v) => !v)}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
                >
                    화력 기준 {showHeatGuide ? '닫기' : '보기'}
                </button>
            </div>

            {/* 화력 기준 안내 패널 */}
            {showHeatGuide && (
                <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                    <p className="font-semibold text-gray-700 mb-2">화력 지수 (0–100) 판단 기준</p>
                    <div className="flex flex-wrap gap-4 mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-red-600">70 이상</span>
                            <span className="text-gray-500">— 높음. 즉시 승인 권장.</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="font-medium text-amber-600">30–69</span>
                            <span className="text-gray-500">— 보통. 제목·카테고리 검토 후 판단.</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-gray-400">30 미만</span>
                            <span className="text-gray-500">— 낮음. 반려 권장.</span>
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5">
                        <p>
                            화력 = 뉴스 신뢰도 × (0.3 + 0.7 × 커뮤니티 증폭계수)
                        </p>
                        <p>
                            커뮤니티 반응 없으면 최대 30점. 반응이 쌓일수록 점진적으로 상승해 최대 100점.
                        </p>
                        <p>
                            뉴스 신뢰도: 출처 20곳 이상 + 50건 이상이면 만점(100). 커뮤니티 증폭계수: 반응 미약(조회수·댓글 거의 없음)은 0 처리.
                        </p>
                        <p className="text-gray-300">
                            공식 근거: 07_이슈등록_화력_정렬_규격.md §2.3, §6.4
                        </p>
                    </div>
                </div>
            )}

            {/* 이슈 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                제목
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                상태
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                승인
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => setShowHeatGuide((v) => !v)}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    화력
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-400 text-[10px] leading-none">?</span>
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성일
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">
                                    <a
                                        href={`/issue/${issue.id}`}
                                        target="_blank"
                                        className="text-blue-600 hover:underline"
                                    >
                                        {issue.title}
                                    </a>
                                </td>
                                <td className="px-4 py-3 text-sm">{issue.category}</td>
                                <td className="px-4 py-3 text-sm">{issue.status}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 text-xs rounded ${getStatusColor(issue.approval_status)}`}>
                                        {APPROVAL_DISPLAY[issue.approval_status] ?? issue.approval_status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    <span className={getHeatMeta(issue.heat_index).className}>
                                        {getHeatMeta(issue.heat_index).label}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {formatDate(issue.created_at)}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPreviewIssue(issue)}
                                            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
                                        >
                                            미리보기
                                        </button>
                                        {issue.approval_status === '대기' && (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(issue.id)}
                                                    className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600"
                                                >
                                                    승인
                                                </button>
                                                <button
                                                    onClick={() => handleReject(issue.id)}
                                                    className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                                                >
                                                    반려
                                                </button>
                                            </>
                                        )}
                                        {issue.approval_status === '승인' && (
                                            <button
                                                onClick={() => handleReject(issue.id)}
                                                className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                                            >
                                                반려
                                            </button>
                                        )}
                                        {issue.approval_status === '반려' && (
                                            <button
                                                onClick={() => handleRestore(issue.id)}
                                                className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                            >
                                                복구
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {issues.length === 0 && (
                <p className="text-center py-8 text-gray-500">이슈가 없습니다</p>
            )}

            {/* 이슈 미리보기 드로어 */}
            <IssuePreviewDrawer
                issue={previewIssue}
                onClose={() => setPreviewIssue(null)}
                onApprove={handleApprove}
                onReject={handleReject}
            />
        </div>
    )
}
