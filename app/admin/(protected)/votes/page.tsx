'use client'

/**
 * app/admin/votes/page.tsx
 *
 * [관리자 - 투표 관리 페이지]
 *
 * 토론 주제와 동일한 패턴:
 * - 직접 생성: 관리자가 이슈 선택 후 투표 제목·선택지 입력
 * - AI 생성: 이슈 메타데이터 기반으로 AI가 투표 후보 생성
 * - 대기 투표: 승인/반려 처리
 * - 진행중/마감 투표: 상태 확인 및 관리
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { decodeHtml } from '@/lib/utils/decode-html'
import AdminPagination from '@/components/admin/AdminPagination'
import AdminTabFilter from '@/components/admin/AdminTabFilter'

interface Issue {
    id: string
    title: string
}

interface VoteChoice {
    id: string
    vote_id: string
    label: string
    count: number
}

interface Vote {
    id: string
    issue_id: string
    title: string | null
    phase: '대기' | '진행중' | '마감'
    approval_status: '대기' | '승인'
    issue_status_snapshot: string | null
    started_at: string | null
    ended_at: string | null
    auto_end_date: string | null
    created_at: string
    is_ai_generated?: boolean
    issues: { id: string; title: string } | null
    vote_choices: VoteChoice[]
}

type FilterPhase = '' | '대기' | '진행중' | '마감'

const FILTER_LABELS: { value: FilterPhase; label: string }[] = [
    { value: '', label: '전체' },
    { value: '대기', label: '대기' },
    { value: '진행중', label: '진행중' },
    { value: '마감', label: '마감' },
]

const PHASE_STYLE: Record<string, string> = {
    '대기': 'bg-yellow-100 text-yellow-700',
    '진행중': 'bg-green-100 text-green-700',
    '마감': 'bg-gray-100 text-gray-600',
}

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

const PAGE_SIZE = 20

export default function AdminVotesPage() {
    const [votes, setVotes] = useState<Vote[]>([])
    const [total, setTotal] = useState(0)
    const [filter, setFilter] = useState<FilterPhase>('대기')
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})

    /* 다중 선택 */
    const [selectedVoteIds, setSelectedVoteIds] = useState<Set<string>>(new Set())
    const [bulkProcessing, setBulkProcessing] = useState(false)

    /* 통합 생성 폼 */
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [approvedIssues, setApprovedIssues] = useState<Issue[]>([])
    const [loadingIssues, setLoadingIssues] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [voteTitle, setVoteTitle] = useState('')
    const [voteChoices, setVoteChoices] = useState(['찬성', '반대', '중립'])
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [generating, setGenerating] = useState(false)
    const [isAiFilled, setIsAiFilled] = useState(false)


    /* 전체 탭 정렬: 대기(0) → 진행중(1) → 마감(2) */
    const SORT_ORDER = (vote: Vote): number =>
        ({ '대기': 0, '진행중': 1, '마감': 2 }[vote.phase] ?? 9)

    /* 승인된 이슈 목록 로드 */
    const loadApprovedIssues = useCallback(async () => {
        setLoadingIssues(true)
        try {
            const res = await fetch('/api/admin/issues?approval_status=승인&limit=100')
            const json = await res.json()
            setApprovedIssues(json.data ?? [])
        } catch {
            setApprovedIssues([])
        } finally {
            setLoadingIssues(false)
        }
    }, [])

    /* 폼 열기 */
    const handleOpenForm = () => {
        setShowCreateForm(true)
        loadApprovedIssues()
    }

    /* 폼 닫기 */
    const handleCloseForm = () => {
        setShowCreateForm(false)
        setSelectedIssue(null)
        setVoteTitle('')
        setVoteChoices(['찬성', '반대', '중립'])
        setFormError(null)
        setIsAiFilled(false)
    }

    /* AI 생성으로 폼 채우기 */
    const handleAiFill = async () => {
        if (!selectedIssue || generating) return
        setGenerating(true)
        setFormError(null)
        try {
            const res = await fetch('/api/admin/votes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: selectedIssue.id, count: 1 }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const generated = json.data?.[0]
            if (generated) {
                setVoteTitle(generated.title || '')
                setVoteChoices(
                    generated.choices?.filter(Boolean) || ['', '']
                )
                setIsAiFilled(true)
            }
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'AI 생성 실패')
        } finally {
            setGenerating(false)
        }
    }

    /* 직접 입력 제출 */
    const handleSubmitManual = async () => {
        if (!selectedIssue || submitting) return
        if (!voteTitle.trim()) {
            setFormError('투표 제목을 입력하세요.')
            return
        }
        const validChoices = voteChoices.filter((c) => c.trim())
        if (validChoices.length < 2) {
            setFormError('선택지는 최소 2개 이상이어야 합니다.')
            return
        }

        setSubmitting(true)
        setFormError(null)

        try {
            const bodyData: any = {
                issue_id: selectedIssue.id,
                title: voteTitle.trim(),
                choices: validChoices,
                is_ai_generated: isAiFilled,
            }
            
            const res = await fetch('/api/admin/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            handleCloseForm()
            setFilter('대기')
            setPage(1)
            loadVotes('대기', 1)
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '생성 실패')
        } finally {
            setSubmitting(false)
        }
    }

    const loadTabCounts = useCallback(async () => {
        const tabParams: { value: FilterPhase; params: Record<string, string> }[] = [
            { value: '', params: {} },
            { value: '대기', params: { phase: '대기' } },
            { value: '진행중', params: { phase: '진행중' } },
            { value: '마감', params: { phase: '마감' } },
        ]
        try {
            const results = await Promise.all(
                tabParams.map(({ params }) => {
                    const p = new URLSearchParams({ limit: '1', offset: '0', ...params })
                    return fetch(`/api/admin/votes?${p}`).then(r => r.ok ? r.json() : null)
                })
            )
            const counts: Record<string, number> = {}
            tabParams.forEach(({ value }, i) => {
                counts[value] = results[i]?.total ?? 0
            })
            setTabCounts(counts)
        } catch {
            // 카운트 로드 실패 시 무시
        }
    }, [])

    const loadVotes = useCallback(async (phase: FilterPhase, targetPage: number = 1) => {
        setLoading(true)
        setError(null)
        setSelectedVoteIds(new Set())
        try {
            const offset = (targetPage - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })

            if (phase) {
                params.set('phase', phase)
            }
            
            const res = await fetch(`/api/admin/votes?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const data: Vote[] = json.data ?? []
            if (!phase) {
                data.sort((a, b) => SORT_ORDER(a) - SORT_ORDER(b))
            }
            setVotes(data)
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTabCounts()
    }, [loadTabCounts])

    useEffect(() => {
        setPage(1)
        loadVotes(filter, 1)
    }, [filter, loadVotes])

    const handleAction = async (id: string, action: '승인' | '복구' | '마감' | '재개' | '삭제') => {
        const confirmMsg =
            action === '승인' ? '이 투표를 승인하여 진행중 상태로 전환하시겠습니까?'
            : action === '복구' ? '이 투표를 대기 상태로 되돌리시겠습니까?'
            : action === '마감' ? '이 투표를 즉시 마감하시겠습니까?'
            : action === '재개' ? '이 투표를 다시 진행중 상태로 재개하시겠습니까? 자동 마감 조건이 초기화됩니다.'
            : '이 투표를 영구 삭제하시겠습니까? 투표와 선택지가 모두 삭제됩니다.'

        if (!window.confirm(confirmMsg)) return
        setProcessingId(id)
        try {
            let endpoint = ''
            let method = 'POST'

            if (action === '승인') {
                endpoint = `/api/admin/votes/${id}/approve`
            } else if (action === '복구') {
                endpoint = `/api/admin/votes/${id}/restore`
            } else if (action === '마감') {
                endpoint = `/api/admin/votes/${id}/close`
            } else if (action === '재개') {
                endpoint = `/api/admin/votes/${id}/reopen`
            } else {
                endpoint = `/api/admin/votes/${id}`
                method = 'DELETE'
            }
            
            const res = await fetch(endpoint, { method })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            setSelectedVoteIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            await Promise.all([loadVotes(filter, page), loadTabCounts()])
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    /* 투표 목록 다중 선택 토글 */
    const handleToggleVoteSelect = (id: string) => {
        setSelectedVoteIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    /* 투표 목록 전체 선택/해제 */
    const handleToggleVoteAll = () => {
        if (selectedVoteIds.size === votes.length) {
            setSelectedVoteIds(new Set())
        } else {
            setSelectedVoteIds(new Set(votes.map(v => v.id)))
        }
    }

    /* 일괄 처리 */
    const handleBulkAction = async (action: '승인' | '복구' | '마감' | '재개' | '삭제') => {
        if (selectedVoteIds.size === 0) return

        const confirmMsg =
            action === '승인' ? `선택한 ${selectedVoteIds.size}개 투표를 승인하시겠습니까?`
            : action === '복구' ? `선택한 ${selectedVoteIds.size}개 투표를 대기 상태로 되돌리시겠습니까?`
            : action === '마감' ? `선택한 ${selectedVoteIds.size}개 투표를 마감하시겠습니까?`
            : action === '재개' ? `선택한 ${selectedVoteIds.size}개 투표를 재개하시겠습니까?`
            : `선택한 ${selectedVoteIds.size}개 투표를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`

        if (!window.confirm(confirmMsg)) return

        setBulkProcessing(true)
        try {
            const selectedIds = Array.from(selectedVoteIds)
            const errors: string[] = []

            for (const id of selectedIds) {
                try {
                    let res
                    if (action === '삭제') {
                        res = await fetch(`/api/admin/votes/${id}`, { method: 'DELETE' })
                    } else {
                        const endpoint =
                            action === '승인' ? `/api/admin/votes/${id}/approve`
                            : action === '복구' ? `/api/admin/votes/${id}/restore`
                            : action === '마감' ? `/api/admin/votes/${id}/close`
                            : `/api/admin/votes/${id}/reopen`
                        res = await fetch(endpoint, { method: 'POST' })
                    }
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.error)
                } catch (e) {
                    errors.push(`${id}: ${e instanceof Error ? e.message : '처리 실패'}`)
                }
            }

            if (errors.length > 0) {
                alert(`일부 항목 처리 실패:\n${errors.join('\n')}`)
            }

            loadVotes(filter, page)
            loadTabCounts()
            setSelectedVoteIds(new Set())
        } catch (e) {
            alert(e instanceof Error ? e.message : '일괄 처리 실패')
        } finally {
            setBulkProcessing(false)
        }
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">투표 관리</h1>
                    <p className="text-sm text-content-muted mt-1">모든 투표 주제는 AI로 자동 생성됩니다.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleOpenForm}
                        className="btn-primary btn-md"
                    >
                        + 투표 생성
                    </button>
                </div>
            </div>

            {/* 통합 생성 폼 */}
            {showCreateForm && (
                <div className="mb-6 p-4 border border-primary-muted bg-primary-light/20 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-primary-dark">투표 생성</h2>
                        <button
                            type="button"
                            onClick={handleCloseForm}
                            className="text-content-muted hover:text-content-secondary text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    {formError && <p className="text-sm text-red-500">{formError}</p>}

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-secondary">대상 이슈 (승인된 이슈만)</label>
                        {loadingIssues ? (
                            <p className="text-sm text-content-muted">이슈 목록 불러오는 중...</p>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedIssue?.id ?? ''}
                                    onChange={(e) => {
                                        const issue = approvedIssues.find((i) => i.id === e.target.value)
                                        setSelectedIssue(issue ?? null)
                                        setVoteTitle('')
                                        setVoteChoices(['찬성', '반대', '중립'])
                                        setIsAiFilled(false)
                                        setFormError(null)
                                    }}
                                    className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface appearance-none"
                                >
                                    <option value="">이슈를 선택하세요</option>
                                    {approvedIssues.map((issue) => (
                                        <option key={issue.id} value={issue.id}>
                                            {issue.title}
                                        </option>
                                    ))}
                                </select>
                                <svg
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* 투표 제목 */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-content-secondary">투표 제목</label>
                            <button
                                type="button"
                                onClick={handleAiFill}
                                disabled={!selectedIssue || generating}
                                className="btn-primary text-xs px-2.5 py-1 rounded-full"
                            >
                                {generating ? 'AI 생성 중...' : '✨ AI 생성'}
                            </button>
                        </div>
                        <input
                            type="text"
                            value={voteTitle}
                            onChange={(e) => {
                                setVoteTitle(e.target.value)
                                setIsAiFilled(false)
                            }}
                            placeholder="투표 질문을 입력하거나, AI 생성 버튼을 눌러 자동 생성하세요"
                            maxLength={40}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                        />
                        <p className="text-sm text-content-muted text-right">{voteTitle.length}/40</p>
                    </div>

                    {/* 선택지 */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-content-secondary">선택지 (2-6개)</label>
                        {voteChoices.map((choice, idx) => (
                            <div key={idx} className="flex gap-2">
                                <input
                                    type="text"
                                    value={choice}
                                    onChange={(e) => {
                                        const newChoices = [...voteChoices]
                                        newChoices[idx] = e.target.value
                                        setVoteChoices(newChoices)
                                        setIsAiFilled(false)
                                    }}
                                    placeholder={`선택지 ${idx + 1}`}
                                    maxLength={20}
                                    className="flex-1 px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                                />
                                {voteChoices.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => setVoteChoices(voteChoices.filter((_, i) => i !== idx))}
                                        className="px-2 py-1 text-sm text-red-500 hover:text-red-700"
                                    >
                                        삭제
                                    </button>
                                )}
                            </div>
                        ))}
                        {voteChoices.length < 6 && (
                            <button
                                type="button"
                                onClick={() => setVoteChoices([...voteChoices, ''])}
                                className="text-xs text-primary hover:text-primary-dark"
                            >
                                + 선택지 추가
                            </button>
                        )}
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={handleCloseForm}
                            className="btn-neutral btn-sm"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitManual}
                            disabled={!selectedIssue || !voteTitle.trim() || voteChoices.filter(c => c.trim()).length < 2 || submitting}
                            className="btn-primary btn-sm disabled:opacity-50"
                        >
                            {submitting ? '생성 중...' : '등록'}
                        </button>
                    </div>
                </div>
            )}

            {/* 필터 탭 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <AdminTabFilter
                    tabs={FILTER_LABELS}
                    active={filter}
                    counts={tabCounts}
                    onChange={setFilter}
                />

                {/* 일괄 처리 버튼 */}
                {selectedVoteIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-content-secondary">
                            {selectedVoteIds.size}개 선택
                        </span>
                        {/* 승인: 대기 탭 */}
                        {filter === '대기' && (
                            <button
                                onClick={() => handleBulkAction('승인')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 승인
                            </button>
                        )}
                        {/* 복구: 진행중 탭 */}
                        {filter === '진행중' && (
                            <button
                                onClick={() => handleBulkAction('복구')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-full hover:bg-yellow-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 복구
                            </button>
                        )}
                        {/* 마감: 진행중 탭 */}
                        {filter === '진행중' && (
                            <button
                                onClick={() => handleBulkAction('마감')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 마감
                            </button>
                        )}
                        {/* 재개: 마감 탭 */}
                        {filter === '마감' && (
                            <button
                                onClick={() => handleBulkAction('재개')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 재개
                            </button>
                        )}
                        {/* 삭제: 모든 탭 */}
                        <button
                            onClick={() => handleBulkAction('삭제')}
                            disabled={bulkProcessing}
                            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedVoteIds(new Set())}
                            className="px-3 py-1.5 text-sm bg-surface border border-border text-content-secondary rounded-full hover:bg-surface-subtle whitespace-nowrap"
                        >
                            선택 해제
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 투표 목록 */}
            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="w-12 px-4 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={votes.length > 0 && selectedVoteIds.size === votes.length}
                                    onChange={handleToggleVoteAll}
                                    className="w-4 h-4 accent-primary"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                투표 제목
                            </th>
                            <th className="w-36 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                선택지
                            </th>
                            <th className="w-48 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                연결 이슈
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                상태
                            </th>
                            <th className="w-28 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                생성일
                            </th>
                            <th className="w-40 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : votes.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-sm text-content-muted">
                                    해당 상태의 투표가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            votes.map((vote) => {
                                const isProcessing = processingId === vote.id
                                const isSelected = selectedVoteIds.has(vote.id)
                                const totalVotes = vote.vote_choices.reduce((sum, c) => sum + c.count, 0)
                                return (
                                    <tr key={vote.id} className={isSelected ? 'bg-primary-light/20' : 'hover:bg-surface-subtle'}>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleVoteSelect(vote.id)}
                                                className="w-4 h-4 accent-primary"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary">
                                            <p className="font-medium">
                                                {vote.title || '(제목 없음)'}
                                            </p>
                                            {vote.issue_status_snapshot && (
                                                <span className="text-sm text-content-muted block">
                                                    시점: {vote.issue_status_snapshot}
                                                </span>
                                            )}
                                            {vote.auto_end_date && vote.phase === '진행중' && (
                                                <span className="text-xs text-primary block">
                                                    📅 {new Date(vote.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료예정
                                                </span>
                                            )}
                                            {vote.auto_end_date && vote.phase === '마감' && (
                                                <span className="text-xs text-content-muted block">
                                                    📅 {new Date(vote.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료됨
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary">
                                            <ul className="space-y-1">
                                                {vote.vote_choices.map((c) => (
                                                    <li key={c.id} className="text-xs">
                                                        {c.label}
                                                        {vote.phase !== '대기' && (
                                                            <span className="text-content-muted ml-1">
                                                                ({c.count}표)
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                        <td className="px-4 py-3 text-sm max-w-xs">
                                            {vote.issues ? (
                                                <Link
                                                    href={`/issue/${vote.issues.id}`}
                                                    target="_blank"
                                                    className="text-primary hover:underline line-clamp-2 break-words"
                                                >
                                                    {decodeHtml(vote.issues.title)}
                                                </Link>
                                            ) : (
                                                <span className="text-content-muted">연결 없음</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${PHASE_STYLE[vote.phase]}`}>
                                                {vote.phase}
                                            </span>
                                            {vote.phase !== '대기' && (
                                                <div className="text-sm text-content-muted mt-1">
                                                    {totalVotes.toLocaleString()}표
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary">
                                            {formatDate(vote.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {vote.phase === '대기' && (
                                                <div className="flex flex-nowrap gap-1.5 min-w-max">
                                                    <button
                                                        onClick={() => handleAction(vote.id, '승인')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(vote.id, '삭제')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                            {vote.phase === '진행중' && (
                                                <div className="flex flex-nowrap gap-1.5 min-w-max">
                                                    <button
                                                        onClick={() => handleAction(vote.id, '복구')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        복구
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(vote.id, '마감')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        마감
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(vote.id, '삭제')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                            {vote.phase === '마감' && (
                                                <div className="flex flex-nowrap gap-1.5 min-w-max">
                                                    <button
                                                        onClick={() => handleAction(vote.id, '재개')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        재개
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(vote.id, '삭제')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            <AdminPagination
                page={page}
                totalPages={Math.ceil(total / PAGE_SIZE)}
                total={total}
                pageSize={PAGE_SIZE}
                disabled={loading}
                onChange={(p) => { setPage(p); loadVotes(filter, p) }}
            />
        </div>
    )
}
