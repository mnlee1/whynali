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

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/** 검토 대기 목록에서 작성자 익명 표시. 뒷4자리로 서로 구분 (99_댓글_작성자_표시_정책 §3.5) */
function maskUserId(userId: string): string {
    return `사용자 …${userId.slice(-4)}`
}

export default function AdminSafetyPage() {
    /* 금칙어 */
    const [rules, setRules] = useState<SafetyRule[]>([])
    const [rulesLoading, setRulesLoading] = useState(true)
    const [rulesError, setRulesError] = useState<string | null>(null)
    const [newWord, setNewWord] = useState('')
    const [addingWord, setAddingWord] = useState(false)
    const [addWordError, setAddWordError] = useState<string | null>(null)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

    /* 검토 대기 댓글 */
    const [pending, setPending] = useState<PendingComment[]>([])
    const [pendingTotal, setPendingTotal] = useState(0)
    const [pendingLoading, setPendingLoading] = useState(true)
    const [pendingError, setPendingError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    /* 마지막 갱신 시각 */
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    /* ── 금칙어 로드 ── */
    const loadRules = useCallback(async () => {
        setRulesLoading(true)
        setRulesError(null)
        try {
            const res = await fetch('/api/admin/safety/rules')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setRules(json.data ?? [])
        } catch (e) {
            setRulesError(e instanceof Error ? e.message : '금칙어 조회 실패')
        } finally {
            setRulesLoading(false)
        }
    }, [])

    /* ── 검토 대기 댓글 로드 ── */
    const loadPending = useCallback(async () => {
        setPendingLoading(true)
        setPendingError(null)
        try {
            const res = await fetch('/api/admin/safety/pending')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setPending(json.data ?? [])
            setPendingTotal(json.total ?? 0)
        } catch (e) {
            setPendingError(e instanceof Error ? e.message : '검토 대기 댓글 조회 실패')
        } finally {
            setPendingLoading(false)
        }
    }, [])

    useEffect(() => {
        loadRules()
        loadPending()
        setLastRefreshedAt(new Date())
    }, [loadRules, loadPending])

    /* ── 금칙어 추가 ── */
    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newWord.trim() || addingWord) return
        setAddingWord(true)
        setAddWordError(null)
        try {
            const res = await fetch('/api/admin/safety/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: newWord.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setNewWord('')
            setRules((prev) => [json.data, ...prev])
        } catch (e) {
            setAddWordError(e instanceof Error ? e.message : '추가 실패')
        } finally {
            setAddingWord(false)
        }
    }

    /* ── 금칙어 삭제 ── */
    const handleDeleteRule = async (id: string, value: string) => {
        if (!window.confirm(`"${value}" 금칙어를 삭제하시겠습니까?`)) return
        setDeletingRuleId(id)
        try {
            const res = await fetch(`/api/admin/safety/rules?id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setRules((prev) => prev.filter((r) => r.id !== id))
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingRuleId(null)
        }
    }

    /* ── 댓글 공개 처리 ── */
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

    /* ── 댓글 삭제 처리 ── */
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

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">세이프티 관리</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => { loadRules(); loadPending(); setLastRefreshedAt(new Date()) }}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── 금칙어 관리 패널 ── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold">
                            금칙어 목록
                            <span className="text-sm font-normal text-gray-500 ml-2">
                                ({rules.length}개)
                            </span>
                        </h2>
                    </div>

                    {/* 추가 폼 */}
                    <form onSubmit={handleAddWord} className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newWord}
                            onChange={(e) => {
                                setNewWord(e.target.value)
                                setAddWordError(null)
                            }}
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
                    {addWordError && (
                        <p className="text-xs text-red-500 mb-3">{addWordError}</p>
                    )}

                    {rulesError && (
                        <p className="text-sm text-red-500 mb-3">{rulesError}</p>
                    )}

                    {rulesLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : rules.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">
                            등록된 금칙어가 없습니다.
                        </p>
                    ) : (
                        <ul className="space-y-2 max-h-96 overflow-y-auto">
                            {rules.map((rule) => (
                                <li
                                    key={rule.id}
                                    className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white"
                                >
                                    <span className="text-sm text-gray-800 font-medium">
                                        {rule.value}
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400">
                                            {formatDate(rule.created_at)}
                                        </span>
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

                    {/* 하드코딩 금칙어 안내 */}
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
                        코드에 하드코딩된 금칙어(<code>lib/safety.ts</code>)는 별도로 즉시 차단됩니다.
                        이 목록은 DB 기반으로 관리자가 추가 운영할 수 있는 확장 금칙어입니다.
                    </div>
                </div>

                {/* ── 검토 대기 댓글 패널 ── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold">
                            검토 대기 댓글
                            {pendingTotal > 0 && (
                                <span className="ml-2 text-sm font-normal px-2 py-0.5 bg-red-100 text-red-700 rounded">
                                    {pendingTotal}건
                                </span>
                            )}
                        </h2>
                    </div>

                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                        금칙어가 포함된 댓글은 자동으로 검토 대기 상태가 됩니다.
                        사용자에게는 "등록되었습니다. 내용 검토 후 공개되거나 삭제될 수 있습니다." 안내가 표시됩니다.
                    </div>

                    {pendingError && (
                        <p className="text-sm text-red-500 mb-3">{pendingError}</p>
                    )}

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
                        <p className="text-sm text-gray-400 text-center py-8">
                            검토 대기 댓글이 없습니다.
                        </p>
                    ) : (
                        <ul className="space-y-3 max-h-96 overflow-y-auto">
                            {pending.map((comment) => {
                                const isProcessing = processingId === comment.id
                                const contextLink = comment.issue_id
                                    ? `/issue/${comment.issue_id}`
                                    : comment.discussion_topic_id
                                    ? `/community/${comment.discussion_topic_id}`
                                    : null

                                return (
                                    <li
                                        key={comment.id}
                                        className="p-3 border border-yellow-200 bg-yellow-50 rounded"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-gray-500">
                                                {maskUserId(comment.user_id)}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {contextLink && (
                                                    <Link
                                                        href={contextLink}
                                                        target="_blank"
                                                        className="text-xs text-blue-500 hover:underline"
                                                    >
                                                        원문 보기
                                                    </Link>
                                                )}
                                                <span className="text-xs text-gray-400">
                                                    {formatDate(comment.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-800 mb-3 leading-relaxed">
                                            {comment.body}
                                        </p>
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

            </div>
        </div>
    )
}
