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
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import CategoryBadge from '@/components/common/CategoryBadge'

interface CandidateAlert {
    title: string
    count: number
    newsCount: number
    communityCount: number
}

type SortField = 'title' | 'status' | 'approval_status' | 'heat_index' | 'created_at'
type SortOrder = 'asc' | 'desc'

export default function AdminIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [alerts, setAlerts] = useState<CandidateAlert[]>([])
    const [alertsDismissed, setAlertsDismissed] = useState(false)
    const [showHeatGuide, setShowHeatGuide] = useState(false)
    const [previewIssue, setPreviewIssue] = useState<Issue | null>(null)
    const [sortField, setSortField] = useState<SortField>('heat_index')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchIssues()
        if (alerts.length === 0 && !alertsDismissed) {
            fetchAlerts()
        }
    }, [filter])

    useEffect(() => {
        if (issues.length > 0) {
            setIssues(sortIssues(issues))
        }
    }, [sortField, sortOrder])

    const fetchAlerts = async () => {
        try {
            const response = await fetch('/api/admin/candidates')
            if (!response.ok) return
            const data = await response.json()
            setAlerts(data.alerts ?? [])
        } catch (error) {
            console.error('[이슈 관리] Candidates 조회 에러:', error)
        }
    }

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '승인': 1, '반려': 2 }

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortOrder('desc')
        }
    }

    const sortIssues = (list: Issue[]) => {
        return [...list].sort((a, b) => {
            let compareResult = 0

            switch (sortField) {
                case 'title':
                    compareResult = a.title.localeCompare(b.title)
                    break
                case 'status':
                    compareResult = a.status.localeCompare(b.status)
                    break
                case 'approval_status':
                    compareResult = (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9)
                    break
                case 'heat_index':
                    compareResult = (a.heat_index ?? 0) - (b.heat_index ?? 0)
                    break
                case 'created_at':
                    compareResult = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    break
            }

            return sortOrder === 'asc' ? compareResult : -compareResult
        })
    }

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
            setIssues(sortIssues(list))
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

    // 다중 선택 관련 함수
    const toggleSelectAll = () => {
        if (selectedIds.size === issues.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(issues.map(i => i.id)))
        }
    }

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const handleBulkApprove = async () => {
        const count = selectedIds.size
        if (count === 0) {
            alert('선택된 이슈가 없습니다')
            return
        }

        if (!confirm(`선택된 ${count}개 이슈를 승인하시겠습니까?`)) return

        try {
            const promises = Array.from(selectedIds).map(id =>
                fetch(`/api/admin/issues/${id}/approve`, { method: 'POST' })
            )
            await Promise.all(promises)
            alert(`${count}개 이슈가 승인되었습니다`)
            setSelectedIds(new Set())
            fetchIssues()
        } catch (err) {
            alert('일괄 승인 실패')
        }
    }

    const handleBulkReject = async () => {
        const count = selectedIds.size
        if (count === 0) {
            alert('선택된 이슈가 없습니다')
            return
        }

        if (!confirm(`선택된 ${count}개 이슈를 반려하시겠습니까?`)) return

        try {
            const promises = Array.from(selectedIds).map(id =>
                fetch(`/api/admin/issues/${id}/reject`, { method: 'POST' })
            )
            await Promise.all(promises)
            alert(`${count}개 이슈가 반려되었습니다`)
            setSelectedIds(new Set())
            fetchIssues()
        } catch (err) {
            alert('일괄 반려 실패')
        }
    }

    const handleBulkRestore = async () => {
        const count = selectedIds.size
        if (count === 0) {
            alert('선택된 이슈가 없습니다')
            return
        }

        if (!confirm(`선택된 ${count}개 이슈를 대기 상태로 복구하시겠습니까?`)) return

        try {
            const promises = Array.from(selectedIds).map(id =>
                fetch(`/api/admin/issues/${id}/restore`, { method: 'POST' })
            )
            await Promise.all(promises)
            alert(`${count}개 이슈가 복구되었습니다`)
            setSelectedIds(new Set())
            fetchIssues()
        } catch (err) {
            alert('일괄 복구 실패')
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    const getApprovalDisplay = (issue: Issue): { label: string; className: string } => {
        if (issue.approval_status === '대기') {
            return {
                label: '대기',
                className: 'bg-yellow-100 text-yellow-700 border-yellow-200'
            }
        }
        
        if (issue.approval_status === '승인') {
            if (issue.approval_type === 'auto') {
                return {
                    label: '자동 승인',
                    className: 'bg-blue-100 text-blue-700 border-blue-200'
                }
            } else if (issue.approval_type === 'manual') {
                return {
                    label: '관리자 승인',
                    className: 'bg-green-100 text-green-700 border-green-200'
                }
            }
        }
        
        if (issue.approval_status === '반려') {
            if (issue.approval_type === 'auto') {
                return {
                    label: '자동 반려',
                    className: 'bg-gray-100 text-gray-600 border-gray-200'
                }
            } else if (issue.approval_type === 'manual') {
                return {
                    label: '관리자 반려',
                    className: 'bg-red-100 text-red-700 border-red-200'
                }
            }
        }
        
        return {
            label: issue.approval_status,
            className: 'bg-gray-100 text-gray-700 border-gray-200'
        }
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

            {/* 기준 안내 패널 */}
            <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h2 className="text-lg font-bold text-blue-900 mb-4">이슈 관리 기준</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 화력 점수 산정 */}
                    <div className="bg-white p-4 rounded border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-3 text-sm">화력 점수 산정</h3>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li className="font-medium text-blue-700">뉴스 신뢰도 (0-100)</li>
                            <li>• 출처 다양성: 20곳 이상 만점</li>
                            <li>• 뉴스 건수: 50건 이상 만점</li>
                            
                            <li className="font-medium text-purple-700 mt-3 pt-3 border-t border-gray-100">커뮤니티 반응 (0-100)</li>
                            <li>• 조회수: 5000건 만점</li>
                            <li>• 댓글수: 500건 만점</li>
                            
                            <li className="pt-3 mt-3 border-t border-gray-100 text-red-600 font-medium">중요: 커뮤니티 수집 0건이면</li>
                            <li className="text-red-600">화력 최대 30점 (자동 승인 불가)</li>
                            <li className="text-gray-500">커뮤니티 반응 있어야 30점 초과</li>
                            
                            <li className="font-medium text-indigo-700 mt-3 pt-3 border-t border-gray-100">계산 예시</li>
                            <li className="text-gray-500 text-[11px]">뉴스 5건, 출처 5곳 → 신뢰도 19점</li>
                            <li className="text-gray-500 text-[11px]">커뮤니티 없음 → 화력 6점 ❌</li>
                            <li className="text-gray-500 text-[11px] mt-1">뉴스 10건, 출처 10곳</li>
                            <li className="text-gray-500 text-[11px]">커뮤니티 없음 → 화력 11점 ✅</li>
                            <li className="text-gray-500 text-[11px] mt-1">뉴스 5건 + 조회 1000/댓글 100</li>
                            <li className="text-gray-500 text-[11px]">→ 화력 11점 ✅</li>
                            
                            <li className="font-medium text-gray-700 mt-3 pt-3 border-t border-gray-200">화력 범위</li>
                            <li>• 70+ 높음 (즉시 승인 권장)</li>
                            <li>• 30-69 보통 (자동 승인 기준)</li>
                            <li>• 10-29 낮음 (반려 권장)</li>
                            <li>• 10 미만 (등록 불가)</li>
                        </ul>
                    </div>

                    {/* 승인 상태 기준 */}
                    <div className="bg-white p-4 rounded border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-3 text-sm">승인 상태 기준</h3>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li className="font-medium text-blue-700">이슈 등록 → 대기</li>
                            <li>• 뉴스 5건 이상 + 화력 10점 이상</li>
                            <li className="text-gray-500 text-[11px] mt-1">화력 10점 달성 조건:</li>
                            <li className="text-gray-500 text-[11px]">- 뉴스 10건 이상 OR</li>
                            <li className="text-gray-500 text-[11px]">- 뉴스 5건 + 커뮤니티 반응</li>
                            <li className="text-gray-500 text-[11px]">  (조회 1000+, 댓글 100+)</li>
                            
                            <li className="font-medium text-green-700 mt-3 pt-3 border-t border-gray-100">대기 → 자동 승인</li>
                            <li>• 화력 30점 이상</li>
                            <li>• 사회/기술/스포츠 카테고리만</li>
                            <li className="text-amber-600">• 연예/정치는 관리자 승인 필수</li>
                            
                            <li className="font-medium text-red-700 mt-3 pt-3 border-t border-gray-100">대기 → 자동 반려</li>
                            <li>• 화력 10점 미만</li>
                        </ul>
                    </div>

                    {/* 이슈 상태 전환 */}
                    <div className="bg-white p-4 rounded border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-3 text-sm">이슈 상태 전환</h3>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li className="font-medium text-orange-600">점화 → 논란중</li>
                            <li>• 6시간 경과 + 화력 30점 이상</li>
                            <li>• 커뮤니티 반응 1건 이상</li>
                            
                            <li className="font-medium text-orange-600 mt-3 pt-3 border-t border-gray-100">점화 → 종결</li>
                            <li>• 6시간 경과 + 화력 10점 미만 (바이패스)</li>
                            <li>• 24시간 경과 + 화력 30점 미만 (타임아웃)</li>
                            
                            <li className="font-medium text-orange-600 mt-3 pt-3 border-t border-gray-100">논란중 → 종결</li>
                            <li>• 화력 10점 미만 또는</li>
                            <li>• 48시간 신규 수집 없음</li>
                            
                            <li className="font-medium text-orange-600 mt-3 pt-3 border-t border-gray-100">종결 → 논란중 (재점화)</li>
                            <li>• 급증: 10분간 분당 5건 이상</li>
                            <li>• 점진: 48시간 내 수집 + 화력 30점 이상</li>
                        </ul>
                    </div>
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

            {/* 필터 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex flex-wrap gap-2">
                    {[
                        { value: '', label: '전체' },
                        { value: '대기', label: '대기' },
                        { value: '승인', label: '승인 전체' },
                        { value: '승인:auto', label: '자동 승인' },
                        { value: '승인:manual', label: '관리자 승인' },
                        { value: '반려', label: '반려 전체' },
                        { value: '반려:auto', label: '자동 반려' },
                        { value: '반려:manual', label: '관리자 반려' },
                    ].map(({ value, label }) => (
                        <button
                            key={label}
                            onClick={() => setFilter(value)}
                            className={`px-3 py-1.5 rounded text-sm ${
                                filter === value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 일괄 작업 버튼 */}
            {selectedIds.size > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-blue-700 font-medium">
                        {selectedIds.size}개 이슈 선택됨
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={handleBulkApprove}
                            className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                        >
                            일괄 승인
                        </button>
                        <button
                            onClick={handleBulkReject}
                            className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                        >
                            일괄 반려
                        </button>
                        <button
                            onClick={handleBulkRestore}
                            className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                        >
                            일괄 복구
                        </button>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                        >
                            선택 해제
                        </button>
                    </div>
                </div>
            )}

            {/* 이슈 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === issues.length && issues.length > 0}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 text-blue-600 rounded"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('title')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    제목
                                    {sortField === 'title' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('status')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    상태
                                    {sortField === 'status' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('approval_status')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    승인
                                    {sortField === 'approval_status' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('heat_index')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    화력
                                    {sortField === 'heat_index' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('created_at')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    생성일
                                    {sortField === 'created_at' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(issue.id)}
                                        onChange={() => toggleSelect(issue.id)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                </td>
                                <td className="px-4 py-3 text-sm font-medium">
                                    <a
                                        href={`/issue/${issue.id}`}
                                        target="_blank"
                                        className="text-blue-600 hover:underline"
                                    >
                                        {decodeHtml(issue.title)}
                                    </a>
                                </td>
                                <td className="px-4 py-3">
                                    <CategoryBadge category={issue.category} size="sm" />
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={issue.status} />
                                </td>
                                <td className="px-4 py-3">
                                    {(() => {
                                        const approvalMeta = getApprovalDisplay(issue)
                                        return (
                                            <span className={`px-2 py-1 text-xs rounded border font-medium ${approvalMeta.className}`}>
                                                {approvalMeta.label}
                                            </span>
                                        )
                                    })()}
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
