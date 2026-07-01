'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BOT_PERSONAS } from '@/lib/bot/personas'

interface BotComment {
    id: string
    body: string
    created_at: string
    visibility: string
    user_id: string
    issue_id: string
    users: { display_name: string } | null
    issues: { id: string; title: string } | null
}

const PAGE_SIZE = 50

function formatDate(dateString: string): string {
    const d = new Date(dateString)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${mo}-${day} ${h}:${mi}`
}

const PERSONA_OPTIONS = [
    { value: '', label: '전체 봇' },
    ...BOT_PERSONAS.map((p) => ({ value: p.id, label: p.displayName })),
]

export default function BotCommentsPage() {
    const [comments, setComments] = useState<BotComment[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [personaId, setPersonaId] = useState('')
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const load = useCallback(async (pid: string, off: number) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
            if (pid) params.set('persona_id', pid)
            const res = await fetch(`/api/admin/bot-comments?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setComments(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch {
            setComments([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load(personaId, offset)
    }, [load, personaId, offset])

    const handlePersonaChange = (pid: string) => {
        setPersonaId(pid)
        setOffset(0)
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 봇 댓글을 삭제하시겠습니까?')) return
        setDeletingId(id)
        try {
            const res = await fetch(`/api/admin/bot-comments?id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            load(personaId, offset)
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">봇 댓글 내역</h1>
                    <p className="text-sm text-content-muted mt-1">
                        자동 생성된 봇 댓글 목록. 총 <span className="font-medium text-content-primary">{total.toLocaleString()}</span>개
                    </p>
                </div>
                <button
                    onClick={() => load(personaId, offset)}
                    className="btn-neutral btn-sm"
                >
                    새로고침
                </button>
            </div>

            {/* 페르소나 필터 */}
            <div className="flex flex-wrap gap-2 mb-4">
                {PERSONA_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => handlePersonaChange(opt.value)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                            personaId === opt.value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface border-border text-content-secondary hover:bg-surface-subtle'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* 테이블 */}
            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="w-36 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">페르소나</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">댓글 내용</th>
                            <th className="w-56 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">연결 이슈</th>
                            <th className="w-36 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">작성일</th>
                            <th className="w-20 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">액션</th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : comments.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-12 text-center text-sm text-content-muted">
                                    봇 댓글이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            comments.map((c) => {
                                const persona = BOT_PERSONAS.find((p) => p.id === c.user_id)
                                return (
                                    <tr key={c.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-3 text-sm">
                                            <span className="font-medium text-content-primary">{c.users?.display_name ?? '알 수 없음'}</span>
                                            {persona && (
                                                <span className="block text-xs text-content-muted mt-0.5">{persona.type}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary max-w-sm">
                                            <p className="line-clamp-2 break-words">{c.body}</p>
                                        </td>
                                        <td className="px-4 py-3 text-sm max-w-xs">
                                            {c.issues ? (
                                                <Link
                                                    href={`/issue/${c.issues.id}`}
                                                    target="_blank"
                                                    className="text-primary hover:underline line-clamp-2 break-words inline-block max-w-full"
                                                >
                                                    {c.issues.title}
                                                </Link>
                                            ) : (
                                                <span className="text-content-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                            {formatDate(c.created_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                disabled={deletingId === c.id}
                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {deletingId === c.id ? '삭제 중...' : '삭제'}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-content-muted">
                        {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total.toLocaleString()}개
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            disabled={offset === 0}
                            className="btn-neutral btn-sm disabled:opacity-40"
                        >
                            이전
                        </button>
                        <span className="flex items-center text-sm text-content-secondary px-2">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                            disabled={offset + PAGE_SIZE >= total}
                            className="btn-neutral btn-sm disabled:opacity-40"
                        >
                            다음
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
