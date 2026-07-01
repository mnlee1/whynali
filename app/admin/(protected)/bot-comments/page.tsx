'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BOT_PERSONAS } from '@/lib/bot/personas'

// ── 타입 ────────────────────────────────────────────────────

interface BotComment {
    id: string
    body: string
    created_at: string
    user_id: string
    users: { display_name: string } | null
    issues: { id: string; title: string } | null
}

interface AutoOpLog {
    id: string
    job_type: string
    status: string
    details: Record<string, unknown> | null
    created_at: string
}

// ── 상수 ────────────────────────────────────────────────────

const PAGE_SIZE = 50

const PERSONA_OPTIONS = [
    { value: '', label: '전체 봇' },
    ...BOT_PERSONAS.map((p) => ({ value: p.id, label: p.displayName })),
]

const STATUS_BADGE: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed:  'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-500',
}
const STATUS_LABELS: Record<string, string> = {
    success: '성공', failed: '실패', skipped: '스킵',
}
const JOB_LABELS: Record<string, string> = {
    bot_comment: '봇 댓글', bot_comment_batch: '봇 배치',
}

// ── 유틸 ────────────────────────────────────────────────────

function fmt(s: string) {
    const d = new Date(s)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtSec(s: string) {
    const d = new Date(s)
    return `${fmt(s)}:${String(d.getSeconds()).padStart(2,'0')}`
}

// ── 실행 로그 상세 셀 ──────────────────────────────────────

function LogDetail({ details }: { details: Record<string, unknown> | null }) {
    if (!details) return <span className="text-content-muted">—</span>
    if ('posted' in details) {
        return (
            <span className="text-sm text-content-secondary">
                스캔 {String(details.scanned ?? 0)}건 중 {String(details.processed ?? 0)}건 처리
                {' → '}
                <span className="font-medium text-content-primary">{String(details.posted ?? 0)}개 등록</span>
            </span>
        )
    }
    return (
        <span className="text-sm text-content-secondary">
            <span className="font-medium text-content-primary">{String(details.persona ?? '')}</span>
            {Boolean(details.persona_type) && (
                <span className="text-xs text-content-muted ml-1">({String(details.persona_type)})</span>
            )}
            {Boolean(details.issue_title) && (
                <span className="block text-xs text-content-muted truncate max-w-xs mt-0.5">
                    이슈: {String(details.issue_title)}
                </span>
            )}
            {Boolean(details.comment) && (
                <span className="block text-xs text-content-secondary truncate max-w-xs mt-0.5 italic">
                    &ldquo;{String(details.comment)}&rdquo;
                </span>
            )}
            {Boolean(details.reason) && (
                <span className="block text-xs text-red-500 mt-0.5">{String(details.reason)}</span>
            )}
        </span>
    )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────

export default function BotCommentsPage() {
    const [tab, setTab] = useState<'comments' | 'logs'>('comments')

    // ── 댓글 내역 상태 ──
    const [comments, setComments] = useState<BotComment[]>([])
    const [commentsTotal, setCommentsTotal] = useState(0)
    const [commentsOffset, setCommentsOffset] = useState(0)
    const [personaId, setPersonaId] = useState('')
    const [commentsLoading, setCommentsLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // ── 실행 로그 상태 ──
    const [logs, setLogs] = useState<AutoOpLog[]>([])
    const [logsTotal, setLogsTotal] = useState(0)
    const [logsOffset, setLogsOffset] = useState(0)
    const [logStatus, setLogStatus] = useState('')
    const [logsLoading, setLogsLoading] = useState(false)

    // ── 데이터 로드 ──

    const loadComments = useCallback(async (pid: string, off: number) => {
        setCommentsLoading(true)
        try {
            const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
            if (pid) p.set('persona_id', pid)
            const res = await fetch(`/api/admin/bot-comments?${p}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setComments(json.data ?? [])
            setCommentsTotal(json.total ?? 0)
        } catch {
            setComments([])
        } finally {
            setCommentsLoading(false)
        }
    }, [])

    const loadLogs = useCallback(async (st: string, off: number) => {
        setLogsLoading(true)
        try {
            const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
            p.set('job_type', 'bot_comment')  // bot 관련만
            if (st) p.set('status', st)
            // batch도 포함하기 위해 job_type 필터 제거
            const p2 = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
            if (st) p2.set('status', st)
            const res = await fetch(`/api/admin/auto-op-logs?${p2}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setLogs(json.data ?? [])
            setLogsTotal(json.total ?? 0)
        } catch {
            setLogs([])
        } finally {
            setLogsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadComments(personaId, commentsOffset)
    }, [loadComments, personaId, commentsOffset])

    useEffect(() => {
        if (tab === 'logs') loadLogs(logStatus, logsOffset)
    }, [loadLogs, tab, logStatus, logsOffset])

    // ── 핸들러 ──

    const handlePersonaChange = (pid: string) => { setPersonaId(pid); setCommentsOffset(0) }
    const handleLogStatusChange = (st: string) => { setLogStatus(st); setLogsOffset(0) }

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 봇 댓글을 삭제하시겠습니까?')) return
        setDeletingId(id)
        try {
            const res = await fetch(`/api/admin/bot-comments?id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            loadComments(personaId, commentsOffset)
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    const commentsTotalPages = Math.ceil(commentsTotal / PAGE_SIZE)
    const logsTotalPages = Math.ceil(logsTotal / PAGE_SIZE)

    // ── 렌더 ──────────────────────────────────────────────────

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <h1 className="text-2xl font-bold text-content-primary">댓글 Bot 관리</h1>
                <button
                    onClick={() => tab === 'comments' ? loadComments(personaId, commentsOffset) : loadLogs(logStatus, logsOffset)}
                    className="btn-neutral btn-sm"
                >
                    새로고침
                </button>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 mb-6 border-b border-border">
                <button
                    onClick={() => setTab('comments')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === 'comments'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-content-secondary hover:text-content-primary'
                    }`}
                >
                    댓글 내역
                    <span className="ml-1.5 text-xs text-content-muted">({commentsTotal.toLocaleString()})</span>
                </button>
                <button
                    onClick={() => setTab('logs')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === 'logs'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-content-secondary hover:text-content-primary'
                    }`}
                >
                    실행 로그
                    <span className="ml-1.5 text-xs text-content-muted">({logsTotal.toLocaleString()})</span>
                </button>
            </div>

            {/* ── 댓글 내역 탭 ── */}
            {tab === 'comments' && (
                <>
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
                                {commentsLoading ? (
                                    [1,2,3,4,5].map((i) => (
                                        <tr key={i}><td colSpan={5} className="px-4 py-3">
                                            <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                        </td></tr>
                                    ))
                                ) : comments.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-content-muted">봇 댓글이 없습니다.</td></tr>
                                ) : (
                                    comments.map((c) => {
                                        const persona = BOT_PERSONAS.find((p) => p.id === c.user_id)
                                        return (
                                            <tr key={c.id} className="hover:bg-surface-subtle">
                                                <td className="px-4 py-3 text-sm">
                                                    <span className="font-medium text-content-primary">{c.users?.display_name ?? '알 수 없음'}</span>
                                                    {persona && <span className="block text-xs text-content-muted mt-0.5">{persona.type}</span>}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-content-primary max-w-sm">
                                                    <p className="line-clamp-2 break-words">{c.body}</p>
                                                </td>
                                                <td className="px-4 py-3 text-sm max-w-xs">
                                                    {c.issues ? (
                                                        <Link href={`/issue/${c.issues.id}`} target="_blank" className="text-primary hover:underline line-clamp-2 break-words inline-block max-w-full">
                                                            {c.issues.title}
                                                        </Link>
                                                    ) : <span className="text-content-muted">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">{fmt(c.created_at)}</td>
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

                    {commentsTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-sm text-content-muted">
                                {commentsOffset + 1}–{Math.min(commentsOffset + PAGE_SIZE, commentsTotal)} / {commentsTotal.toLocaleString()}개
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => setCommentsOffset(Math.max(0, commentsOffset - PAGE_SIZE))} disabled={commentsOffset === 0} className="btn-neutral btn-sm disabled:opacity-40">이전</button>
                                <span className="flex items-center text-sm text-content-secondary px-2">{Math.floor(commentsOffset/PAGE_SIZE)+1} / {commentsTotalPages}</span>
                                <button onClick={() => setCommentsOffset(commentsOffset + PAGE_SIZE)} disabled={commentsOffset + PAGE_SIZE >= commentsTotal} className="btn-neutral btn-sm disabled:opacity-40">다음</button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── 실행 로그 탭 ── */}
            {tab === 'logs' && (
                <>
                    {/* 상태 필터 */}
                    <div className="flex gap-2 mb-4">
                        {[{v:'',l:'전체'},{v:'success',l:'성공'},{v:'failed',l:'실패'},{v:'skipped',l:'스킵'}].map((opt) => (
                            <button
                                key={opt.v}
                                onClick={() => handleLogStatusChange(opt.v)}
                                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                    logStatus === opt.v
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-surface border-border text-content-secondary hover:bg-surface-subtle'
                                }`}
                            >
                                {opt.l}
                            </button>
                        ))}
                    </div>

                    <div className="card overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-surface-subtle">
                                <tr>
                                    <th className="w-44 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">시간</th>
                                    <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">작업</th>
                                    <th className="w-16 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">상태</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">상세</th>
                                </tr>
                            </thead>
                            <tbody className="bg-surface divide-y divide-border">
                                {logsLoading ? (
                                    [1,2,3,4,5].map((i) => (
                                        <tr key={i}><td colSpan={4} className="px-4 py-3">
                                            <div className="h-3 w-full bg-surface-muted rounded animate-pulse" />
                                        </td></tr>
                                    ))
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-content-muted">실행 로그가 없습니다.</td></tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-surface-subtle">
                                            <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">{fmtSec(log.created_at)}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-content-primary whitespace-nowrap">
                                                {JOB_LABELS[log.job_type] ?? log.job_type}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[log.status] ?? 'bg-surface-muted text-content-secondary'}`}>
                                                    {STATUS_LABELS[log.status] ?? log.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 max-w-md">
                                                <LogDetail details={log.details} />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {logsTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-sm text-content-muted">
                                {logsOffset + 1}–{Math.min(logsOffset + PAGE_SIZE, logsTotal)} / {logsTotal.toLocaleString()}건
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => setLogsOffset(Math.max(0, logsOffset - PAGE_SIZE))} disabled={logsOffset === 0} className="btn-neutral btn-sm disabled:opacity-40">이전</button>
                                <span className="flex items-center text-sm text-content-secondary px-2">{Math.floor(logsOffset/PAGE_SIZE)+1} / {logsTotalPages}</span>
                                <button onClick={() => setLogsOffset(logsOffset + PAGE_SIZE)} disabled={logsOffset + PAGE_SIZE >= logsTotal} className="btn-neutral btn-sm disabled:opacity-40">다음</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
