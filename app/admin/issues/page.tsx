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
import { UrgentIssueAlert } from '@/components/admin/UrgentIssueAlert'

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
    const [urgentCount, setUrgentCount] = useState(0)

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
            setUrgentCount(data.urgentCount ?? 0)
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

    const getHeatMeta = (heat: number | null | undefined, approvalHeat?: number | null): { label: string; className: string } => {
        if (heat == null) return { label: '-', className: 'text-gray-400' }
        
        let label = ''
        let className = ''
        
        if (heat >= 70) {
            label = `${heat} 높음`
            className = 'font-semibold text-red-600'
        } else if (heat >= 30) {
            label = `${heat} 보통`
            className = 'font-medium text-amber-600'
        } else if (heat >= 15) {
            label = `${heat} 낮음`
            className = 'text-gray-500'
        } else {
            label = `${heat} 매우낮음`
            className = 'text-gray-400'
        }
        
        // 승인 당시 화력이 있고, 현재 화력과 다르면 표시
        if (approvalHeat != null && approvalHeat !== heat) {
            label += ` ↓ (승인시 ${approvalHeat})`
            className += ' text-xs'
        }
        
        return { label, className }
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
                
                {/* 급증 감지 시스템 */}
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
                    <h3 className="font-semibold text-red-900 mb-3 text-sm flex items-center gap-2">
                        <span className="text-red-600">🔥</span>
                        2-Track 급증 감지 시스템 - 실시간 이슈 빠른 포착
                    </h3>
                    
                    <div className="mb-3 p-3 bg-white rounded border border-red-100">
                        <p className="text-xs text-gray-700 mb-2">
                            <span className="font-semibold text-red-800">왜 필요한가요?</span> 
                            기존에는 30분마다 뉴스를 수집했기 때문에, 빠르게 퍼지는 이슈를 늦게 발견했습니다.
                            급증 감지 시스템은 <span className="font-semibold">뉴스와 커뮤니티 두 곳</span>을 실시간으로 모니터링하여
                            <span className="font-semibold text-red-600"> 3분 안에 급증 이슈를 자동으로 등록</span>합니다.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="p-3 bg-orange-50 rounded border border-orange-200">
                            <p className="font-medium text-orange-900 text-xs mb-2 flex items-center gap-1">
                                <span>📰</span> Track 1: 뉴스 급증 감지 (5분 주기)
                            </p>
                            <div className="space-y-2 ml-4">
                                <div className="flex items-start gap-2">
                                    <span className="text-orange-600 font-semibold text-xs">1단계:</span>
                                    <p className="text-xs text-gray-700">뉴스 수집 중 <span className="font-semibold">5분간 같은 주제로 5건 이상</span> 빠르게 들어오면 급증으로 판단</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-orange-600 font-semibold text-xs">2단계:</span>
                                    <p className="text-xs text-gray-700">AI로 최근 24시간 내 <span className="font-semibold">중복 이슈 체크</span> (제목·키워드·반대어·숫자 4단계 검증)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-orange-600 font-semibold text-xs">3단계:</span>
                                    <p className="text-xs text-gray-700">
                                        급증 강도에 따라 레벨 0-3 자동 산정
                                        <span className="block ml-2 mt-1 text-[11px] text-gray-600">
                                            레벨 3 🔴: 5분 10건 이상 (강함) / 
                                            레벨 2 🟠: 5분 7건 이상 (보통) / 
                                            레벨 1 🟡: 5분 5건 이상 (약함)
                                        </span>
                                    </p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-orange-600 font-semibold text-xs">4단계:</span>
                                    <p className="text-xs text-gray-700">화력 15점 이상 확인 후 🔥 급증 이슈로 등록 (미달 시 등록 안 됨)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-orange-600 font-semibold text-xs">5단계:</span>
                                    <p className="text-xs text-gray-700">
                                        화력 30점 이상이면 자동 승인 (급증/일반 동일 기준)
                                    </p>
                                </div>
                            </div>
                            <div className="mt-2 space-y-1">
                                <p className="text-[11px] text-orange-700 bg-orange-100 px-2 py-1 rounded ml-4">
                                    <span className="font-medium">예시:</span> "OO 사고" 뉴스가 5분 만에 7건 → 화력 16점 → 🔥 급증 이슈로 대기 등록 (30점 도달 시 자동 승인)
                                </p>
                                <p className="text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded ml-4">
                                    <span className="font-medium">장점:</span> 빠른 포착 (5분) + 일관된 품질 기준 (30점)
                                </p>
                            </div>
                        </div>

                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                            <p className="font-medium text-purple-900 text-xs mb-2 flex items-center gap-1">
                                <span>💬</span> Track 2: 커뮤니티 급증 감지 (3분 주기)
                            </p>
                            <div className="space-y-2 ml-4">
                                <div className="flex items-start gap-2">
                                    <span className="text-purple-600 font-semibold text-xs">1단계:</span>
                                    <p className="text-xs text-gray-700">커뮤니티 글에서 <span className="font-semibold">10분간 특정 키워드가 10건 이상</span> 급증하면 감지</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-purple-600 font-semibold text-xs">2단계:</span>
                                    <p className="text-xs text-gray-700"><span className="font-semibold text-purple-700">AI가 진짜 이슈인지 검증</span> (밈, 드립, 장난 글 자동 필터링, 신뢰도 70% 이상)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-purple-600 font-semibold text-xs">3단계:</span>
                                    <p className="text-xs text-gray-700">네이버 뉴스를 검색해서 <span className="font-semibold">관련 뉴스 3건 이상</span> 확인 (언론 검증)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-purple-600 font-semibold text-xs">4단계:</span>
                                    <p className="text-xs text-gray-700">중복 체크 후 <span className="font-semibold text-amber-700">'대기' 상태로 등록</span> (관리자 승인 필수)</p>
                                </div>
                            </div>
                            <div className="mt-2 space-y-1">
                                <p className="text-[11px] text-purple-700 bg-purple-100 px-2 py-1 rounded ml-4">
                                    <span className="font-medium">예시:</span> "OO 논란" 단어가 커뮤니티에서 급증 → AI 진짜 이슈 검증 → 뉴스 3건 확인 → 대기 등록 (🔥 커뮤니티 급증)
                                </p>
                                <p className="text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded ml-4">
                                    <span className="font-medium">특징:</span> 커뮤니티는 검증되지 않은 정보이므로 자동 승인 없이 관리자 확인 필수
                                </p>
                            </div>
                        </div>

                        <div className="p-3 bg-green-50 rounded border border-green-200">
                            <p className="font-medium text-green-900 text-xs mb-2">✅ 중복 방지 시스템</p>
                            <p className="text-xs text-gray-700 ml-4">
                                두 트랙 모두 <span className="font-semibold">AI가 최근 이슈와 비교</span>하여 
                                같은 내용이면 등록하지 않고 기존 이슈에 데이터를 추가합니다.
                            </p>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-red-100 rounded">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-red-800">효과</span>
                                <span className="text-xs text-gray-700">이슈 포착 시간</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 line-through">기존 30분</span>
                                <span className="text-xs text-gray-400">→</span>
                                <span className="text-xs font-bold text-red-600">현재 3-5분</span>
                                <span className="text-xs text-red-700 bg-red-200 px-2 py-0.5 rounded">10배 빠름</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI 활용 안내 */}
                <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded">
                    <h3 className="font-semibold text-purple-900 mb-3 text-sm flex items-center gap-2">
                        <span className="text-purple-600">🤖</span>
                        AI 활용 (선택 + 자동)
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <p className="font-medium text-gray-700 text-xs mb-1">
                                <span className="text-amber-600">기본:</span> 키워드 기반 그루핑
                            </p>
                            <p className="text-xs text-gray-600 ml-4">뉴스 제목에서 키워드 추출 → Jaccard 유사도로 자동 그루핑</p>
                        </div>
                        <div>
                            <p className="font-medium text-purple-800 text-xs mb-1">
                                <span className="text-purple-600">선택:</span> Perplexity AI (품질 개선용, 현재 비활성화)
                            </p>
                            <p className="text-xs text-gray-600 ml-4">환경변수 설정 시 뉴스 그루핑 품질 향상</p>
                        </div>
                        <div>
                            <p className="font-medium text-green-800 text-xs mb-1">
                                <span className="text-green-600">자동:</span> Groq AI (무료, 항상 활성화)
                            </p>
                            <ul className="space-y-1 text-xs text-gray-700 ml-4">
                                <li>• <span className="font-medium">중복 이슈 체크</span>: 4단계 검증 (제목 일치 → 키워드 → 안전장치 → AI)</li>
                                <li>• <span className="font-medium">커뮤니티 급증 검증</span>: 진짜 이슈인지 AI 판단 (신뢰도 70% 이상)</li>
                                <li>• <span className="font-medium">커뮤니티 매칭</span>: 이슈-커뮤니티 글 연결</li>
                            </ul>
                        </div>
                        <p className="text-purple-700 bg-purple-100 px-2 py-1 rounded text-[11px]">
                            <span className="font-medium">법적 안전성:</span> 제목·메타데이터만 사용, 본문·요약문 미사용
                        </p>
                    </div>
                </div>
                
                {/* 이슈 생성 기준 */}
                <div className="mb-4 p-4 bg-white border border-blue-100 rounded">
                    <h3 className="font-semibold text-blue-900 mb-3 text-sm">이슈 생성 기준</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium text-green-700 text-xs mb-2">일반 이슈 (30분 주기)</h4>
                            <ul className="space-y-1 text-xs text-gray-700">
                                <li>• 키워드 그루핑 후 최근 1시간 <span className="font-semibold text-blue-600">5건 이상</span></li>
                                <li>• 화력 <span className="font-semibold text-blue-600">15점 이상</span> 필요</li>
                                <li>• 자동으로 <code className="px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[11px]">대기</code> 상태로 등록</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium text-red-700 text-xs mb-2 flex items-center gap-1">
                                <span>🔥</span> 급증 이슈 (3-5분 감지)
                            </h4>
                            <ul className="space-y-1 text-xs text-gray-700">
                                <li>• 뉴스 5분 5건 OR 커뮤니티 10분 10건 급증</li>
                                <li>• 화력 <span className="font-semibold text-red-600">15점 이상</span> (등록 최소 기준 동일)</li>
                                <li>• <code className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[11px]">is_urgent=true</code> 플래그</li>
                                <li>• 관리자 UI에 🔥 아이콘 표시</li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <h4 className="font-medium text-amber-700 text-xs mb-2">자동 승인 조건</h4>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li>• 일반/급증 공통: 화력 <span className="font-semibold text-blue-600">30점 이상</span> + 허용 카테고리</li>
                            <li className="text-amber-600">• 허용 카테고리: 사회/기술/스포츠</li>
                            <li className="text-red-600">• 연예/정치는 관리자 승인 필수</li>
                            <li className="text-purple-600">• 커뮤니티 급증은 자동 승인 없음 (관리자 필수)</li>
                        </ul>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <h4 className="font-medium text-gray-700 text-xs mb-2">중복 방지 (AI 4단계 검증)</h4>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li>• 1단계: 정확한 제목 일치</li>
                            <li>• 2단계: 공통 키워드 2개 이상 필터링</li>
                            <li>• 3단계: 반대어 감지 ("복귀" vs "사퇴"), 숫자 차이 ("1차" vs "2차")</li>
                            <li>• 4단계: Groq AI 정밀 비교 (신뢰도 80% 이상)</li>
                        </ul>
                    </div>
                </div>
                
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
                            <li className="text-gray-500 text-[11px] mt-1">뉴스 15건, 출처 10곳</li>
                            <li className="text-gray-500 text-[11px]">커뮤니티 없음 → 화력 16점 ✅</li>
                            <li className="text-gray-500 text-[11px] mt-1">뉴스 10건 + 조회 1500/댓글 150</li>
                            <li className="text-gray-500 text-[11px]">→ 화력 15점 ✅</li>
                            
                            <li className="font-medium text-gray-700 mt-3 pt-3 border-t border-gray-200">화력 범위</li>
                            <li>• 70+ 높음 (즉시 승인 권장)</li>
                            <li>• 30-69 보통 (자동 승인 기준)</li>
                            <li>• 15-29 낮음 (반려 권장)</li>
                            <li>• 15 미만 (등록 불가)</li>
                        </ul>
                    </div>

                    {/* 승인 상태 기준 */}
                    <div className="bg-white p-4 rounded border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-3 text-sm">승인 상태 기준</h3>
                        <ul className="space-y-1 text-xs text-gray-700">
                            <li className="font-medium text-blue-700">이슈 등록 → 대기</li>
                            <li>• 일반: 뉴스 5건 + 화력 15점 이상</li>
                            <li>• 급증: 5분 5건 OR 커뮤니티 10분 10건 + 화력 15점 이상</li>
                            
                            <li className="font-medium text-green-700 mt-3 pt-3 border-t border-gray-100">대기 → 자동 승인</li>
                            <li>• 일반/급증 공통: 화력 30점 이상 + 허용 카테고리</li>
                            <li className="text-amber-600">• 사회/기술/스포츠만 자동 승인</li>
                            <li className="text-red-600">• 연예/정치는 관리자 승인 필수</li>
                            <li className="text-purple-600">• 커뮤니티 급증은 자동 승인 없음</li>
                            
                            <li className="font-medium text-red-700 mt-3 pt-3 border-t border-gray-100">대기 → 자동 반려</li>
                            <li>• 화력 15점 미만</li>
                            <li>• AI 중복 감지 (80% 이상 유사)</li>
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

                {/* 긴급 알림 기준 */}
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
                    <h3 className="font-semibold text-red-900 mb-3 text-sm flex items-center gap-2">
                        🚨 긴급 이슈 알림 기준
                    </h3>
                    <div className="space-y-2">
                        <div className="bg-white p-3 rounded border border-red-100">
                            <p className="text-xs text-gray-700 mb-2">
                                <span className="font-semibold text-red-800">즉시 처리 필요 조건:</span> 
                                화력 <span className="font-bold text-red-600">30점 이상</span> + 
                                카테고리 <span className="font-bold text-red-600">'연예' 또는 '정치'</span> + 
                                승인 상태 <span className="font-bold text-red-600">'대기'</span>
                            </p>
                            <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-xs text-gray-600 mb-1 font-medium">알림 채널</p>
                                <ul className="space-y-1 text-xs text-gray-600 ml-4">
                                    <li>• UI 배너: 관리자 페이지 상단에 실시간 표시 (해제 가능, 1시간 후 재표시)</li>
                                    <li>• Dooray 즉시 알림: 이슈 등록 시점에 메신저로 즉시 전송</li>
                                    <li>• Dooray 배치 알림: 매시 정각마다 대기 중인 긴급 이슈 목록 전송</li>
                                </ul>
                            </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded border border-amber-200">
                            <p className="text-xs font-semibold text-amber-800 mb-1">왜 연예/정치만 긴급 알림?</p>
                            <ul className="space-y-1 text-xs text-gray-700 ml-4">
                                <li>• 사회/기술/스포츠는 화력 30점 이상이면 자동 승인됨 (알림 불필요)</li>
                                <li>• 연예/정치는 민감도가 높아 관리자 승인 필수</li>
                                <li>• 화력 15-29점은 중요도가 낮아 즉시 알림 불필요 (일반 대기 목록에서 처리)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* 긴급 이슈 알림 배너 */}
            <UrgentIssueAlert urgentCount={urgentCount} />

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
                            <th className="px-4 py-3 text-left w-12">
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">
                                <button
                                    onClick={() => handleSort('heat_index')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    <div className="flex flex-col items-start">
                                        <span>화력 추이</span>
                                        <span className="text-[10px] text-gray-400 font-normal normal-case">등록 시 → 현재</span>
                                    </div>
                                    {sortField === 'heat_index' && (
                                        <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-64">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 w-12">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(issue.id)}
                                        onChange={() => toggleSelect(issue.id)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                </td>
                                <td className="px-4 py-3 text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        {issue.is_urgent && (
                                            <span className="text-red-500" title="급증 이슈">🔥</span>
                                        )}
                                        <a
                                            href={`/issue/${issue.id}`}
                                            target="_blank"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {decodeHtml(issue.title)}
                                        </a>
                                        {issue.source_track === 'community_burst' && (
                                            <span className="px-2 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded font-medium whitespace-nowrap">
                                                커뮤니티 급증
                                            </span>
                                        )}
                                        {issue.source_track === 'news_collection' && issue.is_urgent && (
                                            <span className="px-2 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded font-medium whitespace-nowrap">
                                                뉴스 급증
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 w-28">
                                    <CategoryBadge category={issue.category} size="sm" />
                                </td>
                                <td className="px-4 py-3 w-32 whitespace-nowrap">
                                    <StatusBadge status={issue.status} />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap w-40">
                                    {(() => {
                                        const approvalMeta = getApprovalDisplay(issue)
                                        return (
                                            <span className={`px-2 py-1 text-xs rounded border font-medium ${approvalMeta.className}`}>
                                                {approvalMeta.label}
                                            </span>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap w-40">
                                    {(() => {
                                        const currentHeat = issue.heat_index ?? 0
                                        const createdHeat = issue.created_heat_index ?? currentHeat
                                        const heatMeta = getHeatMeta(currentHeat, issue.approval_heat_index)
                                        
                                        // 화력 변화 계산
                                        const heatDiff = currentHeat - createdHeat
                                        const trendIcon = heatDiff > 0 ? '↑' : heatDiff < 0 ? '↓' : '→'
                                        const trendColor = heatDiff > 0 ? 'text-green-600' : heatDiff < 0 ? 'text-red-600' : 'text-gray-500'
                                        
                                        return (
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-1">
                                                    <span className={heatMeta.className}>
                                                        {createdHeat}점
                                                    </span>
                                                    <span className={`text-xs ${trendColor}`}>{trendIcon}</span>
                                                    <span className={heatMeta.className}>
                                                        {currentHeat}점
                                                    </span>
                                                </div>
                                                {heatDiff !== 0 && (
                                                    <span className={`text-[10px] ${trendColor}`}>
                                                        ({heatDiff > 0 ? '+' : ''}{heatDiff}점)
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap w-40">
                                    {formatDate(issue.created_at)}
                                </td>
                                <td className="px-4 py-3 text-sm w-64">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPreviewIssue(issue)}
                                            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded hover:bg-blue-50 whitespace-nowrap"
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
