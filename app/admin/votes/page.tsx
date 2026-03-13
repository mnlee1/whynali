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
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    /* 다중 선택 */
    const [selectedVoteIds, setSelectedVoteIds] = useState<Set<string>>(new Set())
    const [bulkProcessing, setBulkProcessing] = useState(false)

    /* 통합 생성 폼 */
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [createMode, setCreateMode] = useState<'ai' | 'manual'>('ai')
    const [approvedIssues, setApprovedIssues] = useState<Issue[]>([])
    const [loadingIssues, setLoadingIssues] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [voteTitle, setVoteTitle] = useState('')
    const [voteChoices, setVoteChoices] = useState(['', ''])
    const [aiCount, setAiCount] = useState(2)
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    /* 자동 종료 옵션 */
    const [autoEndEnabled, setAutoEndEnabled] = useState(false)
    const [autoEndType, setAutoEndType] = useState<'date' | 'participants'>('date')
    const [autoEndDate, setAutoEndDate] = useState('')
    const [autoEndParticipants, setAutoEndParticipants] = useState('')

    /* AI 미리보기 */
    const [generatedVotes, setGeneratedVotes] = useState<Array<{
        title: string
        choices: string[]
    }>>([])
    const [showPreview, setShowPreview] = useState(false)
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
    const [generating, setGenerating] = useState(false)
    const [saving, setSaving] = useState(false)
    const [regenerateDisabled, setRegenerateDisabled] = useState(false)

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
        setCreateMode('ai')
        setFormError(null)
        setGeneratedVotes([])
        setShowPreview(false)
        setSelectedIndices(new Set())
        setAutoEndEnabled(false)
        setAutoEndType('date')
        setAutoEndDate('')
        setAutoEndParticipants('')
    }

    /* AI 생성 (미리보기) */
    const handleGenerate = async () => {
        if (!selectedIssue || generating) return

        setGenerating(true)
        setFormError(null)

        try {
            const res = await fetch('/api/admin/votes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: selectedIssue.id, count: aiCount }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            const votes = json.data.map((v: any) => ({
                title: v.title || '',
                choices: v.vote_choices?.map((c: any) => c.label) || []
            }))

            setGeneratedVotes(votes)
            setSelectedIndices(new Set(votes.map((_: any, idx: number) => idx)))
            setShowPreview(true)
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'AI 생성 실패')
        } finally {
            setGenerating(false)
        }
    }

    /* 재생성 */
    const handleRegenerate = async () => {
        if (regenerateDisabled) return
        setRegenerateDisabled(true)
        await handleGenerate()
        setTimeout(() => setRegenerateDisabled(false), 5000)
    }

    /* 전체 선택/해제 */
    const handleTogglePreviewAll = () => {
        if (selectedIndices.size === generatedVotes.length) {
            setSelectedIndices(new Set())
        } else {
            setSelectedIndices(new Set(generatedVotes.map((_, idx) => idx)))
        }
    }

    /* 개별 선택 토글 */
    const handleTogglePreviewSelect = (idx: number) => {
        const newSet = new Set(selectedIndices)
        if (newSet.has(idx)) {
            newSet.delete(idx)
        } else {
            newSet.add(idx)
        }
        setSelectedIndices(newSet)
    }

    /* 선택 항목 등록 */
    const handleSaveSelected = async () => {
        if (!selectedIssue || saving || selectedIndices.size === 0) return

        setSaving(true)
        setFormError(null)

        try {
            const selectedVotes = generatedVotes.filter((_, idx) => selectedIndices.has(idx))

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

            for (const vote of selectedVotes) {
                const res = await fetch('/api/admin/votes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        issue_id: selectedIssue.id,
                        title: vote.title,
                        choices: vote.choices,
                        ...autoEndOptions,
                    }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
            }

            handleCloseForm()
            setFilter('대기')
            setPage(1)
            loadVotes('대기', 1)
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '저장 실패')
        } finally {
            setSaving(false)
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

            const res = await fetch('/api/admin/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: selectedIssue.id,
                    title: voteTitle.trim(),
                    choices: validChoices,
                    ...autoEndOptions,
                }),
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
            setLastRefreshedAt(new Date())
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
                    <h1 className="text-2xl font-bold">투표 관리</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => loadVotes(filter, page)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                    <button
                        onClick={handleOpenForm}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        + 투표 생성
                    </button>
                </div>
            </div>

            {/* 통합 생성 폼 */}
            {showCreateForm && (
                <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-blue-800">투표 생성</h2>
                        <button
                            type="button"
                            onClick={handleCloseForm}
                            className="text-blue-400 hover:text-blue-600 text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    {formError && <p className="text-sm text-red-500">{formError}</p>}

                    {/* AI/직접 선택 토글 */}
                    <div className="flex gap-2 p-1 bg-blue-100 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setCreateMode('ai')}
                            className={[
                                'flex-1 px-3 py-1.5 text-sm rounded transition-colors',
                                createMode === 'ai'
                                    ? 'bg-white text-blue-800 font-medium shadow-sm'
                                    : 'text-blue-600 hover:text-blue-800',
                            ].join(' ')}
                        >
                            AI 생성
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreateMode('manual')}
                            className={[
                                'flex-1 px-3 py-1.5 text-sm rounded transition-colors',
                                createMode === 'manual'
                                    ? 'bg-white text-blue-800 font-medium shadow-sm'
                                    : 'text-blue-600 hover:text-blue-800',
                            ].join(' ')}
                        >
                            직접 입력
                        </button>
                    </div>

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">대상 이슈 (승인된 이슈만)</label>
                        {loadingIssues ? (
                            <p className="text-xs text-gray-400">이슈 목록 불러오는 중...</p>
                        ) : (
                            <select
                                value={selectedIssue?.id ?? ''}
                                onChange={(e) => {
                                    const issue = approvedIssues.find((i) => i.id === e.target.value)
                                    setSelectedIssue(issue ?? null)
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
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

                    {/* AI 생성 옵션 */}
                    {createMode === 'ai' && !showPreview && (
                        <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded">
                            <p className="text-xs text-purple-700">
                                이슈 메타데이터(제목·카테고리·화력)를 기반으로 AI가 투표 후보를 생성합니다.
                            </p>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-gray-600">생성 개수</label>
                                <select
                                    value={aiCount}
                                    onChange={(e) => setAiCount(Number(e.target.value))}
                                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none"
                                    disabled={generating}
                                >
                                    {[1, 2, 3].map((n) => (
                                        <option key={n} value={n}>{n}개</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* AI 미리보기 */}
                    {createMode === 'ai' && showPreview && (
                        <div className="space-y-3 p-3 bg-white border border-gray-200 rounded">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-gray-800">
                                    생성 결과 ({generatedVotes.length}개)
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleTogglePreviewAll}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                    {selectedIndices.size === generatedVotes.length ? '전체 해제' : '전체 선택'}
                                </button>
                            </div>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {generatedVotes.map((vote, idx) => (
                                    <div
                                        key={idx}
                                        className={[
                                            'p-3 border rounded transition-colors',
                                            selectedIndices.has(idx)
                                                ? 'border-blue-300 bg-blue-50'
                                                : 'border-gray-200 bg-white'
                                        ].join(' ')}
                                    >
                                        <label className="flex items-start gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedIndices.has(idx)}
                                                onChange={() => handleTogglePreviewSelect(idx)}
                                                className="mt-0.5 w-4 h-4"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 mb-1">
                                                    {vote.title}
                                                </p>
                                                <ul className="space-y-0.5">
                                                    {vote.choices.map((choice, cidx) => (
                                                        <li key={cidx} className="text-xs text-gray-600">
                                                            • {choice}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={handleRegenerate}
                                    disabled={regenerateDisabled || generating}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {regenerateDisabled ? '재생성 대기 중...' : '🔄 재생성'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveSelected}
                                    disabled={saving || selectedIndices.size === 0}
                                    className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                >
                                    {saving ? '등록 중...' : `선택 항목 등록 (${selectedIndices.size})`}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 직접 입력 폼 */}
                    {createMode === 'manual' && selectedIssue && (
                        <div className="space-y-3 p-3 bg-white border border-gray-200 rounded">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-600">투표 제목</label>
                                <input
                                    type="text"
                                    value={voteTitle}
                                    onChange={(e) => setVoteTitle(e.target.value)}
                                    placeholder="투표 질문을 입력하세요"
                                    maxLength={40}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                                />
                                <p className="text-xs text-gray-400 text-right">{voteTitle.length}/40</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-600">선택지 (2-6개)</label>
                                {voteChoices.map((choice, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={choice}
                                            onChange={(e) => {
                                                const newChoices = [...voteChoices]
                                                newChoices[idx] = e.target.value
                                                setVoteChoices(newChoices)
                                            }}
                                            placeholder={`선택지 ${idx + 1}`}
                                            maxLength={20}
                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
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
                                        className="text-xs text-blue-600 hover:text-blue-800"
                                    >
                                        + 선택지 추가
                                    </button>
                                )}
                            </div>

                            {/* 자동 종료 옵션 */}
                            <div className="space-y-2 pt-2 border-t border-gray-200">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="autoEndEnabled"
                                        checked={autoEndEnabled}
                                        onChange={(e) => setAutoEndEnabled(e.target.checked)}
                                        className="rounded"
                                    />
                                    <label htmlFor="autoEndEnabled" className="text-xs font-medium text-gray-600">
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
                                                />
                                                <span className="text-xs text-gray-600">날짜</span>
                                            </label>
                                            <label className="flex items-center gap-1.5">
                                                <input
                                                    type="radio"
                                                    name="autoEndType"
                                                    value="participants"
                                                    checked={autoEndType === 'participants'}
                                                    onChange={(e) => setAutoEndType(e.target.value as 'participants')}
                                                />
                                                <span className="text-xs text-gray-600">참여자 수</span>
                                            </label>
                                        </div>

                                        {autoEndType === 'date' && (
                                            <input
                                                type="datetime-local"
                                                value={autoEndDate}
                                                onChange={(e) => setAutoEndDate(e.target.value)}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                                            />
                                        )}

                                        {autoEndType === 'participants' && (
                                            <input
                                                type="number"
                                                value={autoEndParticipants}
                                                onChange={(e) => setAutoEndParticipants(e.target.value)}
                                                placeholder="목표 참여자 수 입력"
                                                min="1"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 직접 입력 제출 버튼 */}
                            <div className="flex gap-2 pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={handleCloseForm}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmitManual}
                                    disabled={!voteTitle.trim() || voteChoices.filter(c => c.trim()).length < 2 || submitting}
                                    className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                >
                                    {submitting ? '생성 중...' : '등록'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AI 생성 제출 버튼 */}
                    {createMode === 'ai' && !showPreview && (
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={handleCloseForm}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!selectedIssue || generating}
                                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                            >
                                {generating ? 'AI 생성 중...' : 'AI 생성'}
                            </button>
                        </div>
                    )}
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
                                'px-4 py-1.5 text-sm rounded',
                                filter === value
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* 일괄 처리 버튼 */}
                {selectedVoteIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                            {selectedVoteIds.size}개 선택
                        </span>
                        {(filter === '대기' || filter === '반려') && (
                            <button
                                onClick={() => handleBulkAction('승인')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                            >
                                일괄 승인
                            </button>
                        )}
                        {(filter === '대기' || filter === '진행중') && (
                            <button
                                onClick={() => handleBulkAction('반려')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                            >
                                일괄 반려
                            </button>
                        )}
                        <button
                            onClick={() => handleBulkAction('삭제')}
                            disabled={bulkProcessing}
                            className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedVoteIds(new Set())}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            선택 해제
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 투표 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-12 px-4 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={votes.length > 0 && selectedVoteIds.size === votes.length}
                                    onChange={handleToggleVoteAll}
                                    className="w-4 h-4"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                투표 제목
                            </th>
                            <th className="w-48 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                선택지
                            </th>
                            <th className="w-64 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                연결 이슈
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                상태
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성일
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="px-4 py-3">
                                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : votes.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                                    해당 상태의 투표가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            votes.map((vote) => {
                                const isProcessing = processingId === vote.id
                                const isSelected = selectedVoteIds.has(vote.id)
                                const totalVotes = vote.vote_choices.reduce((sum, c) => sum + c.count, 0)
                                return (
                                    <tr key={vote.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleVoteSelect(vote.id)}
                                                className="w-4 h-4"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800">
                                            <p className="font-medium">
                                                {vote.title || '(제목 없음)'}
                                            </p>
                                            {vote.issue_status_snapshot && (
                                                <span className="text-xs text-gray-400 block">
                                                    시점: {vote.issue_status_snapshot}
                                                </span>
                                            )}
                                            {vote.auto_end_date && (
                                                <span className="text-xs text-blue-600 block">
                                                    📅 {new Date(vote.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료
                                                </span>
                                            )}
                                            {vote.auto_end_participants && (
                                                <span className="text-xs text-blue-600 block">
                                                    🎯 {vote.auto_end_participants}명 도달 시 종료
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            <ul className="space-y-1">
                                                {vote.vote_choices.map((c) => (
                                                    <li key={c.id} className="text-xs">
                                                        {c.label}
                                                        {vote.phase !== '대기' && (
                                                            <span className="text-gray-400 ml-1">
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
                                                    className="text-blue-600 hover:underline line-clamp-2 break-words"
                                                >
                                                    {decodeHtml(vote.issues.title)}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-400">연결 없음</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                {filter !== '대기' && vote.approval_status === '반려' ? (
                                                    <span className={`inline-block px-2 py-1 text-xs rounded ${APPROVAL_STATUS_STYLE[vote.approval_status]}`}>
                                                        {vote.approval_status}
                                                    </span>
                                                ) : (
                                                    <span className={`inline-block px-2 py-1 text-xs rounded ${PHASE_STYLE[vote.phase]}`}>
                                                        {vote.phase}
                                                    </span>
                                                )}
                                            </div>
                                            {vote.phase !== '대기' && (
                                                <div className="text-xs text-gray-400 mt-1">
                                                    {totalVotes.toLocaleString()}표
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {formatDate(vote.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {vote.phase === '대기' && (
                                                <div className="flex gap-1.5">
                                                    <button
                                                        onClick={() => handleAction(vote.id, '승인')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                                    >
                                                        승인
                                                    </button>
                                                    {filter !== '반려' && (
                                                        <button
                                                            onClick={() => handleAction(vote.id, '반려')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                        >
                                                            반려
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleAction(vote.id, '삭제')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                            {vote.phase === '진행중' && (
                                                <div className="flex gap-1.5">
                                                    <button
                                                        onClick={() => handleAction(vote.id, '종료')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                                                    >
                                                        수동 종료
                                                    </button>
                                                    {filter !== '반려' && (
                                                        <button
                                                            onClick={() => handleAction(vote.id, '반려')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
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
                                                    className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                                >
                                                    재개
                                                </button>
                                            )}
                                            {vote.approval_status === '반려' && vote.phase !== '대기' && (
                                                <button
                                                    onClick={() => handleAction(vote.id, '삭제')}
                                                    disabled={isProcessing}
                                                    className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
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
                    <span className="text-sm text-gray-500">
                        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / 총 {total}개
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setPage(1); loadVotes(filter, 1) }}
                            disabled={page === 1 || loading}
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            «
                        </button>
                        <button
                            onClick={() => { setPage(page - 1); loadVotes(filter, page - 1) }}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            이전
                        </button>
                        <span className="px-3 py-1.5 text-sm font-medium text-gray-700">
                            {page} / {Math.ceil(total / PAGE_SIZE)}
                        </span>
                        <button
                            onClick={() => { setPage(page + 1); loadVotes(filter, page + 1) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            다음
                        </button>
                        <button
                            onClick={() => { const last = Math.ceil(total / PAGE_SIZE); setPage(last); loadVotes(filter, last) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
