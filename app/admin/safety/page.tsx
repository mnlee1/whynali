'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface SafetyRule {
    id: string
    kind: string
    value: string
    created_at: string
}

interface PendingComment {
    id: string
    body: string
    user_id: string
    issue_id: string | null
    discussion_topic_id: string | null
    created_at: string
}

interface ReportItem {
    id: string
    comment_id: string
    reason: string
    status: string
    created_at: string
    comment_body: string | null
    issue_id: string | null
    discussion_topic_id: string | null
    report_count: number
}

type LeftTab = 'banned_word' | 'ai_banned_word' | 'excluded_word'
type RightTab = 'pending' | 'reports'

function formatDate(dateString: string): string {
    const d = new Date(dateString)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function maskUserId(userId: string): string {
    return `사용자 …${userId.slice(-4)}`
}

const LEFT_TABS: { key: LeftTab; label: string }[] = [
    { key: 'banned_word', label: '관리자 금칙어' },
    { key: 'ai_banned_word', label: 'AI 자동 생성' },
    { key: 'excluded_word', label: '제외 목록' },
]

const RIGHT_TABS: { key: RightTab; label: string }[] = [
    { key: 'pending', label: '금칙어 감지 댓글' },
    { key: 'reports', label: '신고 댓글' },
]

export default function AdminSafetyPage() {
    const [leftTab, setLeftTab] = useState<LeftTab>('banned_word')
    const [rightTab, setRightTab] = useState<RightTab>('pending')

    /* 관리자 금칙어 */
    const [bannedRules, setBannedRules] = useState<SafetyRule[]>([])
    const [bannedLoading, setBannedLoading] = useState(true)
    const [bannedError, setBannedError] = useState<string | null>(null)
    const [newWord, setNewWord] = useState('')
    const [addingWord, setAddingWord] = useState(false)
    const [addWordError, setAddWordError] = useState<string | null>(null)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

    /* AI 생성 금칙어 */
    const [aiRules, setAiRules] = useState<SafetyRule[]>([])
    const [aiLoading, setAiLoading] = useState(true)
    const [aiError, setAiError] = useState<string | null>(null)

    /* 제외 목록 */
    const [excludedRules, setExcludedRules] = useState<SafetyRule[]>([])
    const [excludedLoading, setExcludedLoading] = useState(true)
    const [excludedError, setExcludedError] = useState<string | null>(null)

    /* kind 변경 공통 로딩 */
    const [changingKindId, setChangingKindId] = useState<string | null>(null)

    /* 금칙어 감지 댓글 */
    const [pending, setPending] = useState<PendingComment[]>([])
    const [pendingTotal, setPendingTotal] = useState(0)
    const [pendingLoading, setPendingLoading] = useState(true)
    const [pendingError, setPendingError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    /* 신고 댓글 */
    const [reports, setReports] = useState<ReportItem[]>([])
    const [reportsTotal, setReportsTotal] = useState(0)
    const [reportsLoading, setReportsLoading] = useState(true)
    const [reportsError, setReportsError] = useState<string | null>(null)
    const [processingReportId, setProcessingReportId] = useState<string | null>(null)

    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    /* ── 로드 함수 ── */
    const loadBannedRules = useCallback(async () => {
        setBannedLoading(true); setBannedError(null)
        try {
            const res = await fetch('/api/admin/safety/rules?kind=banned_word')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setBannedRules(json.data ?? [])
        } catch (e) {
            setBannedError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setBannedLoading(false)
        }
    }, [])

    const loadAiRules = useCallback(async () => {
        setAiLoading(true); setAiError(null)
        try {
            const res = await fetch('/api/admin/safety/rules?kind=ai_banned_word')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setAiRules(json.data ?? [])
        } catch (e) {
            setAiError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setAiLoading(false)
        }
    }, [])

    const loadExcludedRules = useCallback(async () => {
        setExcludedLoading(true); setExcludedError(null)
        try {
            const res = await fetch('/api/admin/safety/rules?kind=excluded_word')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setExcludedRules(json.data ?? [])
        } catch (e) {
            setExcludedError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setExcludedLoading(false)
        }
    }, [])

    const loadPending = useCallback(async () => {
        setPendingLoading(true); setPendingError(null)
        try {
            const res = await fetch('/api/admin/safety/pending')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setPending(json.data ?? [])
            setPendingTotal(json.total ?? 0)
        } catch (e) {
            setPendingError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setPendingLoading(false)
        }
    }, [])

    const loadReports = useCallback(async () => {
        setReportsLoading(true); setReportsError(null)
        try {
            const res = await fetch('/api/admin/reports?status=대기')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setReports(json.data ?? [])
            setReportsTotal(json.total ?? 0)
        } catch (e) {
            setReportsError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setReportsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadBannedRules()
        loadAiRules()
        loadExcludedRules()
        loadPending()
        loadReports()
        setLastRefreshedAt(new Date())
    }, [loadBannedRules, loadAiRules, loadExcludedRules, loadPending, loadReports])

    const handleRefresh = () => {
        loadBannedRules(); loadAiRules(); loadExcludedRules()
        loadPending(); loadReports()
        setLastRefreshedAt(new Date())
    }

    /* ── 관리자 금칙어 추가/삭제 ── */
    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newWord.trim() || addingWord) return
        setAddingWord(true); setAddWordError(null)
        try {
            const res = await fetch('/api/admin/safety/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: newWord.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setNewWord('')
            setBannedRules((prev) => [json.data, ...prev])
        } catch (e) {
            setAddWordError(e instanceof Error ? e.message : '추가 실패')
        } finally {
            setAddingWord(false)
        }
    }

    const handleDeleteRule = async (id: string, value: string) => {
        if (!window.confirm(`"${value}" 금칙어를 삭제하시겠습니까?`)) return
        setDeletingRuleId(id)
        try {
            const res = await fetch(`/api/admin/safety/rules?id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setBannedRules((prev) => prev.filter((r) => r.id !== id))
            setExcludedRules((prev) => prev.filter((r) => r.id !== id))
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingRuleId(null)
        }
    }

    /* ── kind 변경 (제외 처리 / 복원) ── */
    const handleChangeKind = async (
        id: string,
        newKind: 'excluded_word' | 'ai_banned_word',
        fromKind: 'ai_banned_word' | 'excluded_word'
    ) => {
        setChangingKindId(id)
        try {
            const res = await fetch(`/api/admin/safety/rules/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: newKind }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const item: SafetyRule = json.data
            if (fromKind === 'ai_banned_word') {
                setAiRules((prev) => prev.filter((r) => r.id !== id))
                setExcludedRules((prev) => [item, ...prev])
            } else {
                setExcludedRules((prev) => prev.filter((r) => r.id !== id))
                setAiRules((prev) => [item, ...prev])
            }
        } catch (e) {
            alert(e instanceof Error ? e.message : '변경 실패')
        } finally {
            setChangingKindId(null)
        }
    }

    /* ── 검토 대기 댓글 처리 ── */
    const handleApprove = async (id: string) => {
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/safety/pending/${id}`, { method: 'PATCH' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setPending((prev) => prev.filter((c) => c.id !== id))
            setPendingTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            alert(e instanceof Error ? e.message : '공개 처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleReject = async (id: string) => {
        if (!window.confirm('이 댓글을 삭제 처리하시겠습니까?')) return
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/safety/pending/${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setPending((prev) => prev.filter((c) => c.id !== id))
            setPendingTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    /* ── 신고 처리 ── */
    const handleReportAction = async (reportId: string, action: '처리완료' | '무시') => {
        if (action === '처리완료' && !window.confirm('댓글을 삭제 처리하시겠습니까?')) return
        setProcessingReportId(reportId)
        try {
            const res = await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setReports((prev) => prev.filter((r) => r.id !== reportId))
            setReportsTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingReportId(null)
        }
    }

    /* ── 탭 버튼 헬퍼 ── */
    function TabBtn<T extends string>({
        current, value, label, badge, onClick,
    }: { current: T; value: T; label: string; badge?: number; onClick: (v: T) => void }) {
        const active = current === value
        return (
            <button
                onClick={() => onClick(value)}
                className={[
                    'px-3 py-1.5 text-sm rounded transition-colors',
                    active
                        ? 'bg-gray-800 text-white font-medium'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
                ].join(' ')}
            >
                {label}
                {badge !== undefined && badge > 0 && (
                    <span className={[
                        'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                        active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600',
                    ].join(' ')}>
                        {badge}
                    </span>
                )}
            </button>
        )
    }

    function RuleListSkeleton() {
        return (
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <h1 className="text-2xl font-bold">세이프티 관리</h1>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── 좌측: 금칙어 관리 패널 ── */}
                <div>
                    <h2 className="text-lg font-semibold mb-3">금칙어 목록</h2>

                    {/* 좌측 탭 */}
                    <div className="flex gap-1 mb-4 border-b border-gray-200 pb-2">
                        {LEFT_TABS.map(({ key, label }) => (
                            <TabBtn
                                key={key}
                                current={leftTab}
                                value={key}
                                label={label}
                                badge={
                                    key === 'banned_word' ? bannedRules.length :
                                    key === 'ai_banned_word' ? aiRules.length :
                                    excludedRules.length
                                }
                                onClick={setLeftTab}
                            />
                        ))}
                    </div>

                    {/* 탭 1: 관리자 금칙어 */}
                    {leftTab === 'banned_word' && (
                        <div>
                            <form onSubmit={handleAddWord} className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newWord}
                                    onChange={(e) => { setNewWord(e.target.value); setAddWordError(null) }}
                                    placeholder="금칙어 입력..."
                                    maxLength={50}
                                    className={[
                                        'flex-1 px-3 py-2 text-sm border rounded focus:outline-none',
                                        addWordError
                                            ? 'border-red-400 focus:border-red-500'
                                            : 'border-gray-300 focus:border-blue-400',
                                    ].join(' ')}
                                />
                                <button
                                    type="submit"
                                    disabled={!newWord.trim() || addingWord}
                                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                >
                                    {addingWord ? '추가 중...' : '추가'}
                                </button>
                            </form>
                            {addWordError && <p className="text-xs text-red-500 mb-3">{addWordError}</p>}
                            {bannedError && <p className="text-sm text-red-500 mb-3">{bannedError}</p>}
                            {bannedLoading ? <RuleListSkeleton /> : bannedRules.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">등록된 금칙어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {bannedRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white">
                                            <span className="text-sm font-medium text-gray-800">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-400">{formatDate(rule.created_at)}</span>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id, rule.value)}
                                                    disabled={deletingRuleId === rule.id}
                                                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 탭 2: AI 자동 생성 목록 */}
                    {leftTab === 'ai_banned_word' && (
                        <div>
                            {aiError && <p className="text-sm text-red-500 mb-3">{aiError}</p>}
                            {aiLoading ? <RuleListSkeleton /> : aiRules.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">AI가 생성한 금칙어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {aiRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white">
                                            <span className="text-sm font-medium text-gray-800">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-400">{formatDate(rule.created_at)}</span>
                                                <button
                                                    onClick={() => handleChangeKind(rule.id, 'excluded_word', 'ai_banned_word')}
                                                    disabled={changingKindId === rule.id}
                                                    className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-50"
                                                >
                                                    {changingKindId === rule.id ? '처리 중...' : '제외 처리'}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 탭 3: 제외 목록 */}
                    {leftTab === 'excluded_word' && (
                        <div>
                            {excludedError && <p className="text-sm text-red-500 mb-3">{excludedError}</p>}
                            {excludedLoading ? <RuleListSkeleton /> : excludedRules.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">제외 처리된 단어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {excludedRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white">
                                            <span className="text-sm font-medium text-gray-500 line-through">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-400">{formatDate(rule.created_at)}</span>
                                                <button
                                                    onClick={() => handleChangeKind(rule.id, 'ai_banned_word', 'excluded_word')}
                                                    disabled={changingKindId === rule.id}
                                                    className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
                                                >
                                                    {changingKindId === rule.id ? '처리 중...' : '복원'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id, rule.value)}
                                                    disabled={deletingRuleId === rule.id}
                                                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 금칙어 정책 안내 */}
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
                        <p className="mb-2"><strong>금칙어 정책:</strong></p>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>코드 하드코딩 금칙어(<code>lib/safety.ts</code>): 즉시 차단</li>
                            <li>관리자 금칙어: DB 등록, 매칭 시 검토 대기</li>
                            <li>AI 생성 금칙어: 자동 탐지, 제외 처리 가능</li>
                            <li>제외 목록: AI 금칙어에서 제외된 단어</li>
                        </ul>
                    </div>
                </div>

                {/* ── 우측: 댓글 검토 패널 ── */}
                <div>
                    {/* 우측 탭 */}
                    <div className="flex gap-1 mb-4 border-b border-gray-200 pb-2">
                        {RIGHT_TABS.map(({ key, label }) => (
                            <TabBtn
                                key={key}
                                current={rightTab}
                                value={key}
                                label={label}
                                badge={key === 'pending' ? pendingTotal : reportsTotal}
                                onClick={setRightTab}
                            />
                        ))}
                    </div>

                    {/* 탭 1: 금칙어 감지 댓글 */}
                    {rightTab === 'pending' && (
                        <div>
                            <div className={[
                                'mb-3 p-3 border rounded text-xs',
                                pendingTotal >= 10
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-yellow-50 border-yellow-200 text-yellow-700',
                            ].join(' ')}>
                                {pendingTotal >= 10 ? (
                                    <><strong>알림:</strong> 검토 대기 댓글이 10건 이상입니다. 관리자 이메일로 알림이 발송되었습니다.</>
                                ) : (
                                    <>금칙어가 포함된 댓글은 자동으로 검토 대기 상태가 됩니다.</>
                                )}
                            </div>
                            {pendingError && <p className="text-sm text-red-500 mb-3">{pendingError}</p>}
                            {pendingLoading ? (
                                <div className="space-y-3">
                                    {[1, 2].map((i) => (
                                        <div key={i} className="p-3 border rounded space-y-2">
                                            <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                                            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            ) : pending.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">검토 대기 댓글이 없습니다.</p>
                            ) : (
                                <ul className="space-y-3 max-h-[480px] overflow-y-auto">
                                    {pending.map((comment) => {
                                        const isProcessing = processingId === comment.id
                                        const contextLink = comment.issue_id
                                            ? `/issue/${comment.issue_id}`
                                            : comment.discussion_topic_id
                                            ? `/community/${comment.discussion_topic_id}`
                                            : null
                                        return (
                                            <li key={comment.id} className="p-3 border border-yellow-200 bg-yellow-50 rounded">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-gray-500">{maskUserId(comment.user_id)}</span>
                                                    <div className="flex items-center gap-2">
                                                        {contextLink && (
                                                            <Link href={contextLink} target="_blank" className="text-xs text-blue-500 hover:underline">
                                                                원문 보기
                                                            </Link>
                                                        )}
                                                        <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-800 mb-3 leading-relaxed">{comment.body}</p>
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleApprove(comment.id)}
                                                        disabled={isProcessing}
                                                        className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                                    >
                                                        {isProcessing ? '처리 중...' : '공개'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(comment.id)}
                                                        disabled={isProcessing}
                                                        className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 탭 2: 신고 댓글 */}
                    {rightTab === 'reports' && (
                        <div>
                            {reportsError && <p className="text-sm text-red-500 mb-3">{reportsError}</p>}
                            {reportsLoading ? (
                                <div className="space-y-3">
                                    {[1, 2].map((i) => (
                                        <div key={i} className="p-3 border rounded space-y-2">
                                            <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                                            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            ) : reports.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">신고된 댓글이 없습니다.</p>
                            ) : (
                                <ul className="space-y-3 max-h-[480px] overflow-y-auto">
                                    {reports.map((report) => {
                                        const isProcessing = processingReportId === report.id
                                        const contextLink = report.issue_id ? `/issue/${report.issue_id}` : null
                                        return (
                                            <li key={report.id} className="p-3 border border-red-100 bg-red-50 rounded">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={[
                                                            'text-xs px-2 py-0.5 rounded font-medium',
                                                            'bg-red-100 text-red-700',
                                                        ].join(' ')}>
                                                            {report.reason}
                                                        </span>
                                                        {report.report_count >= 2 && (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-red-500 text-white font-medium">
                                                                {report.report_count}건 신고
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {contextLink && (
                                                            <Link href={contextLink} target="_blank" className="text-xs text-blue-500 hover:underline">
                                                                원문 보기
                                                            </Link>
                                                        )}
                                                        <span className="text-xs text-gray-400">{formatDate(report.created_at)}</span>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-800 my-2 leading-relaxed">
                                                    {report.comment_body ?? <span className="text-gray-400 italic">삭제된 댓글</span>}
                                                </p>
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleReportAction(report.id, '처리완료')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        {isProcessing ? '처리 중...' : '댓글 삭제'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleReportAction(report.id, '무시')}
                                                        disabled={isProcessing}
                                                        className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        무시
                                                    </button>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}
