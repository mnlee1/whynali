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
    approval_status: '대기' | '승인' | '반려'
    issue_status_snapshot: string | null
    started_at: string | null
    ended_at: string | null
    auto_end_date: string | null
    auto_end_participants: number | null
    created_at: string
    is_ai_generated?: boolean
    issues: { id: string; title: string } | null
    vote_choices: VoteChoice[]
}

type FilterPhase = '' | '대기' | '진행중' | '마감' | '반려'

const FILTER_LABELS: { value: FilterPhase; label: string }[] = [
    { value: '', label: '전체' },
    { value: '대기', label: '대기' },
    { value: '진행중', label: '진행중' },
    { value: '마감', label: '마감' },
    { value: '반려', label: '반려' },
]

const PHASE_STYLE: Record<string, string> = {
    '대기': 'bg-yellow-100 text-yellow-700',
    '진행중': 'bg-green-100 text-green-700',
    '마감': 'bg-gray-100 text-gray-600',
}

const APPROVAL_STATUS_STYLE: Record<string, string> = {
    '대기': 'bg-yellow-100 text-yellow-700',
    '승인': 'bg-green-100 text-green-700',
    '반려': 'bg-red-100 text-red-700',
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

    /* 다중 선택 */
    const [selectedVoteIds, setSelectedVoteIds] = useState<Set<string>>(new Set())
    const [bulkProcessing, setBulkProcessing] = useState(false)

    /* 통합 생성 폼 */
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [approvedIssues, setApprovedIssues] = useState<Issue[]>([])
    const [loadingIssues, setLoadingIssues] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [voteTitle, setVoteTitle] = useState('')
    const [voteChoices, setVoteChoices] = useState(['', ''])
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [generating, setGenerating] = useState(false)
    const [isAiFilled, setIsAiFilled] = useState(false)

    /* 자동 종료 옵션 */
    const [autoEndEnabled, setAutoEndEnabled] = useState(false)
    const [autoEndType, setAutoEndType] = useState<'date' | 'participants'>('date')
    const [autoEndDate, setAutoEndDate] = useState('')
    const [autoEndParticipants, setAutoEndParticipants] = useState('')

    /* 전체 탭 정렬: 대기(0) → 진행중(1) → 반려(2) → 마감(3) */
    const SORT_ORDER = (vote: Vote): number => {
        if (vote.approval_status === '반려') return 2
        if (vote.phase === '마감') return 3
        return { '대기': 0, '진행중': 1 }[vote.phase] ?? 9
    }

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
        setVoteChoices(['', ''])
        setFormError(null)
        setIsAiFilled(false)
        setAutoEndEnabled(false)
        setAutoEndType('date')
        setAutoEndDate('')
        setAutoEndParticipants('')
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
                    generated.vote_choices?.map((c: any) => c.label).filter(Boolean) || ['', '']
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
            // 자동 종료 옵션 준비
            const autoEndOptions: any = {}
            if (autoEndEnabled) {
                if (autoEndType === 'date' && autoEndDate) {
                    autoEndOptions.auto_end_date = new Date(autoEndDate).toISOString()
                }
                if (autoEndType === 'participants' && autoEndParticipants) {
                    autoEndOptions.auto_end_participants = parseInt(autoEndParticipants, 10)
                }
            }

            const bodyData: any = {
                issue_id: selectedIssue.id,
                title: voteTitle.trim(),
                choices: validChoices,
                is_ai_generated: isAiFilled,
                ...autoEndOptions,
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

    const loadVotes = useCallback(async (phase: FilterPhase, targetPage: number = 1) => {
        setLoading(true)
        setError(null)
        setSelectedVoteIds(new Set())
        try {
            const offset = (targetPage - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })

            if (phase === '반려') {
                params.set('approval_status', '반려')
            } else if (phase === '대기') {
                params.set('phase', '대기')
                params.set('approval_status', '대기')
            } else if (phase) {
                params.set('phase', phase)
                params.set('approval_status', '승인')
            }
            /* 전체 탭: approval_status 조건 없음 — 반려 포함 전체 조회 */
            
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
        setPage(1)
        loadVotes(filter, 1)
    }, [filter, loadVotes])

    const handleAction = async (id: string, action: '승인' | '반려' | '삭제' | '종료' | '재개') => {
        let confirmMsg = ''
        
        if (action === '승인') {
            confirmMsg = '이 투표를 승인하여 진행중 상태로 전환하시겠습니까?'
        } else if (action === '반려') {
            confirmMsg = '이 투표를 반려 처리하시겠습니까? (대기 상태로 유지되며 삭제되지 않습니다)'
        } else if (action === '삭제') {
            confirmMsg = '이 투표를 영구 삭제하시겠습니까? 투표와 선택지가 모두 삭제됩니다.'
        } else if (action === '종료') {
            confirmMsg = '이 투표를 즉시 종료하시겠습니까?'
        } else if (action === '재개') {
            confirmMsg = '이 투표를 다시 진행중 상태로 재개하시겠습니까? 자동 마감 조건(날짜/참여자 수)이 초기화됩니다.'
        }
        
        if (!window.confirm(confirmMsg)) return
        setProcessingId(id)
        try {
            let endpoint = ''
            let method = 'POST'
            
            if (action === '승인') {
                endpoint = `/api/admin/votes/${id}/approve`
            } else if (action === '반려') {
                endpoint = `/api/admin/votes/${id}/reject`
            } else if (action === '삭제') {
                endpoint = `/api/admin/votes/${id}`
                method = 'DELETE'
            } else if (action === '종료') {
                endpoint = `/api/admin/votes/${id}/close`
            } else if (action === '재개') {
                endpoint = `/api/admin/votes/${id}/reopen`
            }
            
            const res = await fetch(endpoint, { method })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            setSelectedVoteIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            await loadVotes(filter, page)
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
    const handleBulkAction = async (action: '승인' | '반려' | '삭제') => {
        if (selectedVoteIds.size === 0) return

        const confirmMsg =
            action === '승인'
                ? `선택한 ${selectedVoteIds.size}개 투표를 승인하시겠습니까?`
                : action === '반려'
                ? `선택한 ${selectedVoteIds.size}개 투표를 반려 처리하시겠습니까? (삭제되지 않으며 반려 상태로 유지됩니다)`
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
                        const endpoint = action === '승인' ? `/api/admin/votes/${id}/approve` : `/api/admin/votes/${id}/reject`
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
                            <p className="text-xs text-content-muted">이슈 목록 불러오는 중...</p>
                        ) : (
                            <select
                                value={selectedIssue?.id ?? ''}
                                onChange={(e) => {
                                    const issue = approvedIssues.find((i) => i.id === e.target.value)
                                    setSelectedIssue(issue ?? null)
                                }}
                                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                            >
                                <option value="">이슈를 선택하세요</option>
                                {approvedIssues.map((issue) => (
                                    <option key={issue.id} value={issue.id}>
                                        {issue.title}
                                    </option>
                                ))}
                            </select>
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
                                className="text-xs px-2.5 py-1 bg-primary text-white rounded-full hover:bg-primary-dark disabled:opacity-50"
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
                        <p className="text-xs text-content-muted text-right">{voteTitle.length}/40</p>
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

                    {/* 자동 종료 설정 */}
                    <div className="space-y-2 pt-2 border-t border-border">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="autoEndEnabled"
                                checked={autoEndEnabled}
                                onChange={(e) => setAutoEndEnabled(e.target.checked)}
                                className="rounded accent-primary"
                            />
                            <label htmlFor="autoEndEnabled" className="text-xs font-medium text-content-secondary">
                                자동 종료 설정
                            </label>
                        </div>

                        {autoEndEnabled && (
                            <div className="pl-6 space-y-2">
                                <div className="flex gap-2">
                                    <label className="flex items-center gap-1.5">
                                        <input
                                            type="radio"
                                            name="autoEndType"
                                            value="date"
                                            checked={autoEndType === 'date'}
                                            onChange={(e) => setAutoEndType(e.target.value as 'date')}
                                            className="accent-primary"
                                        />
                                        <span className="text-xs text-content-secondary">날짜</span>
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                        <input
                                            type="radio"
                                            name="autoEndType"
                                            value="participants"
                                            checked={autoEndType === 'participants'}
                                            onChange={(e) => setAutoEndType(e.target.value as 'participants')}
                                            className="accent-primary"
                                        />
                                        <span className="text-xs text-content-secondary">참여자 수</span>
                                    </label>
                                </div>

                                {autoEndType === 'date' && (
                                    <input
                                        type="datetime-local"
                                        value={autoEndDate}
                                        onChange={(e) => setAutoEndDate(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                                    />
                                )}

                                {autoEndType === 'participants' && (
                                    <input
                                        type="number"
                                        value={autoEndParticipants}
                                        onChange={(e) => setAutoEndParticipants(e.target.value)}
                                        placeholder="목표 참여자 수 입력"
                                        min="1"
                                        className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                                    />
                                )}
                            </div>
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
                <div className="flex gap-2">
                    {FILTER_LABELS.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setFilter(value)}
                            className={[
                                'px-4 py-1.5 text-sm rounded-full border transition-colors',
                                filter === value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* 일괄 처리 버튼 */}
                {selectedVoteIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-content-secondary">
                            {selectedVoteIds.size}개 선택
                        </span>
                        {(filter === '대기' || filter === '반려') && (
                            <button
                                onClick={() => handleBulkAction('승인')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 승인
                            </button>
                        )}
                        {(filter === '대기' || filter === '진행중') && (
                            <button
                                onClick={() => handleBulkAction('반려')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 반려
                            </button>
                        )}
                        <button
                            onClick={() => handleBulkAction('삭제')}
                            disabled={bulkProcessing}
                            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedVoteIds(new Set())}
                            className="btn-neutral btn-sm"
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                투표 제목
                            </th>
                            <th className="w-48 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                선택지
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                생성 유형
                            </th>
                            <th className="w-64 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                연결 이슈
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                상태
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                생성일
                            </th>
                            <th className="w-52 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={8} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : votes.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-sm text-content-muted">
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
                                                <span className="text-xs text-content-muted block">
                                                    시점: {vote.issue_status_snapshot}
                                                </span>
                                            )}
                                            {vote.auto_end_date && (
                                                <span className="text-xs text-primary block">
                                                    📅 {new Date(vote.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료
                                                </span>
                                            )}
                                            {vote.auto_end_participants && (
                                                <span className="text-xs text-primary block">
                                                    🎯 {vote.auto_end_participants}명 도달 시 종료
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
                                        <td className="px-4 py-3">
                                            {vote.is_ai_generated ? (
                                                <span className="text-xs px-2 py-0.5 bg-primary-light text-primary-dark rounded-full border border-primary-muted">
                                                    AI 생성
                                                </span>
                                            ) : (
                                                <span className="text-xs px-2 py-0.5 bg-surface-muted text-content-secondary rounded-full border border-border">
                                                    직접 생성
                                                </span>
                                            )}
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
                                            <div className="space-y-1">
                                                {filter !== '대기' && vote.approval_status === '반려' ? (
                                                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${APPROVAL_STATUS_STYLE[vote.approval_status]}`}>
                                                        {vote.approval_status}
                                                    </span>
                                                ) : (
                                                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${PHASE_STYLE[vote.phase]}`}>
                                                        {vote.phase}
                                                    </span>
                                                )}
                                            </div>
                                            {vote.phase !== '대기' && (
                                                <div className="text-xs text-content-muted mt-1">
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
                                                    {filter !== '반려' && (
                                                        <button
                                                            onClick={() => handleAction(vote.id, '반려')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            반려
                                                        </button>
                                                    )}
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
                                                        onClick={() => handleAction(vote.id, '종료')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        마감
                                                    </button>
                                                    {filter !== '반려' && (
                                                        <button
                                                            onClick={() => handleAction(vote.id, '반려')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            반려
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {vote.phase === '마감' && (
                                                <button
                                                    onClick={() => handleAction(vote.id, '재개')}
                                                    disabled={isProcessing}
                                                    className="btn-primary btn-sm text-xs disabled:opacity-50"
                                                >
                                                    재개
                                                </button>
                                            )}
                                            {vote.approval_status === '반려' && vote.phase !== '대기' && (
                                                <button
                                                    onClick={() => handleAction(vote.id, '삭제')}
                                                    disabled={isProcessing}
                                                    className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    삭제
                                                </button>
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
            {total > 0 && (
                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-content-secondary">
                        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / 총 {total}개
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setPage(1); loadVotes(filter, 1) }}
                            disabled={page === 1 || loading}
                            className="px-2 py-1.5 text-sm border border-border rounded-xl hover:bg-surface-muted disabled:opacity-40"
                        >
                            «
                        </button>
                        <button
                            onClick={() => { setPage(page - 1); loadVotes(filter, page - 1) }}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-border rounded-xl hover:bg-surface-muted disabled:opacity-40"
                        >
                            이전
                        </button>
                        <span className="px-3 py-1.5 text-sm font-medium text-content-primary">
                            {page} / {Math.ceil(total / PAGE_SIZE)}
                        </span>
                        <button
                            onClick={() => { setPage(page + 1); loadVotes(filter, page + 1) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-3 py-1.5 text-sm border border-border rounded-xl hover:bg-surface-muted disabled:opacity-40"
                        >
                            다음
                        </button>
                        <button
                            onClick={() => { const last = Math.ceil(total / PAGE_SIZE); setPage(last); loadVotes(filter, last) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-2 py-1.5 text-sm border border-border rounded-xl hover:bg-surface-muted disabled:opacity-40"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
