/**
 * components/admin/IssueMergeModal.tsx
 *
 * [관리자 이슈 병합 모달]
 *
 * 선택한 소스 이슈를 타깃 이슈로 병합합니다.
 * - 기존 이슈 목록에서 타깃 검색·선택
 * - 확인 후 POST /api/admin/issues/[sourceId]/merge 호출
 */

'use client'

import { useState, useEffect } from 'react'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'

interface IssueMergeModalProps {
    sourceIssue: Issue
    onClose: () => void
    onSuccess: () => void
}

export default function IssueMergeModal({
    sourceIssue,
    onClose,
    onSuccess,
}: IssueMergeModalProps) {
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<Issue[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedTarget, setSelectedTarget] = useState<Issue | null>(null)
    const [merging, setMerging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const handler = setTimeout(() => {
            if (search.trim().length >= 2) {
                doSearch(search.trim())
            } else {
                setResults([])
            }
        }, 300)
        return () => clearTimeout(handler)
    }, [search])

    const doSearch = async (query: string) => {
        setSearching(true)
        try {
            const res = await fetch(`/api/admin/issues?search=${encodeURIComponent(query)}`)
            if (!res.ok) throw new Error('검색 실패')
            const data = await res.json()
            setResults(
                (data.data as Issue[]).filter(
                    i => i.id !== sourceIssue.id && i.approval_status !== '병합됨'
                )
            )
        } catch {
            setResults([])
        } finally {
            setSearching(false)
        }
    }

    const handleMerge = async () => {
        if (!selectedTarget) return
        setMerging(true)
        setError(null)
        try {
            const res = await fetch(`/api/admin/issues/${sourceIssue.id}/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: selectedTarget.id }),
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.message ?? '병합 실패')
            }
            onSuccess()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : '병합 중 오류가 발생했습니다.')
        } finally {
            setMerging(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-surface rounded-2xl border border-border w-full max-w-lg mx-4 shadow-xl">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-bold text-content-primary">이슈 병합</h2>
                    <p className="mt-1 text-sm text-content-secondary">
                        소스 이슈의 모든 데이터(뉴스·커뮤니티·타임라인 등)가 타깃으로 이동됩니다.
                    </p>
                </div>

                <div className="px-6 py-4 space-y-4">
                    {/* 소스 이슈 */}
                    <div>
                        <p className="text-xs font-medium text-content-muted uppercase mb-1.5">소스 이슈 (병합됨 처리)</p>
                        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                            {decodeHtml(sourceIssue.title)}
                        </div>
                    </div>

                    {/* 타깃 이슈 검색 */}
                    <div>
                        <p className="text-xs font-medium text-content-muted uppercase mb-1.5">타깃 이슈 검색</p>
                        <input
                            type="text"
                            value={search}
                            onChange={e => {
                                setSearch(e.target.value)
                                setSelectedTarget(null)
                            }}
                            placeholder="제목 2자 이상 입력"
                            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />

                        {searching && (
                            <p className="mt-2 text-xs text-content-muted">검색 중...</p>
                        )}

                        {!searching && results.length > 0 && !selectedTarget && (
                            <ul className="mt-2 border border-border rounded-xl overflow-hidden divide-y divide-border max-h-48 overflow-y-auto">
                                {results.map(issue => (
                                    <li key={issue.id}>
                                        <button
                                            onClick={() => setSelectedTarget(issue)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-subtle transition-colors"
                                        >
                                            <span className="font-medium text-content-primary">{decodeHtml(issue.title)}</span>
                                            <span className="ml-2 text-xs text-content-muted">{issue.category} · 화력 {issue.heat_index ?? 0}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {!searching && search.trim().length >= 2 && results.length === 0 && (
                            <p className="mt-2 text-xs text-content-muted">검색 결과가 없습니다.</p>
                        )}
                    </div>

                    {/* 선택된 타깃 */}
                    {selectedTarget && (
                        <div>
                            <p className="text-xs font-medium text-content-muted uppercase mb-1.5">선택된 타깃 이슈 (유지됨)</p>
                            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                                <span className="flex-1 text-sm text-green-700 font-medium">
                                    {decodeHtml(selectedTarget.title)}
                                </span>
                                <button
                                    onClick={() => setSelectedTarget(null)}
                                    className="text-xs text-content-muted hover:text-content-secondary"
                                >
                                    변경
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={merging}
                        className="btn-neutral btn-sm"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleMerge}
                        disabled={!selectedTarget || merging}
                        className="text-sm px-4 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {merging ? '병합 중...' : '병합 실행'}
                    </button>
                </div>
            </div>
        </div>
    )
}
