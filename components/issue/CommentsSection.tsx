/**
 * components/issue/CommentsSection.tsx
 *
 * 이슈 댓글 및 토론 댓글 섹션.
 * - 베스트 댓글(score 상위) 상단 고정
 * - 리스트 정렬: 최신순 / 좋아요순 / 싫어요순
 * - 댓글별 좋아요/싫어요 버튼 (토글, 낙관적 업데이트)
 * - 답글(대댓글) 작성/표시 (1단계)
 * - 댓글·답글 신고 (reports 테이블)
 * - 작성/수정/삭제, 세이프티봇 연동
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDate } from '@/lib/utils/format-date'
import type { Comment } from '@/types'
import SafetyBotSettingModal from '@/components/issue/SafetyBotSettingModal'
import ReportModal from '@/components/issue/ReportModal'
import NicknameAvatar from '@/components/common/NicknameAvatar'

interface CommentsSectionProps {
    issueId?: string
    discussionTopicId?: string
    userId: string | null
    isClosed?: boolean
}

type SortOption = 'latest' | 'likes' | 'dislikes'
type CommentWithLike = Comment & {
    userLikeType?: 'like' | 'dislike' | null
    replyCount?: number
}

const PAGE_SIZE = 5
const RATE_LIMIT_SECONDS = 60


function authorLabel(comment: Comment): string {
    if (comment.display_name?.trim()) return comment.display_name.trim()
    return `사용자 …${comment.user_id.slice(-4)}`
}


export default function CommentsSection({
    issueId,
    discussionTopicId,
    userId: serverUserId,
    isClosed = false,
}: CommentsSectionProps) {
    const [userId, setUserId] = useState<string | null>(serverUserId)

    /* 댓글 목록 상태 */
    const [bestComments, setBestComments] = useState<CommentWithLike[]>([])
    const [comments, setComments] = useState<CommentWithLike[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const sort: SortOption = 'latest'
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /* 댓글 작성 상태 */
    const [draft, setDraft] = useState('')
    const [submittingWrite, setSubmittingWrite] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)
    const [writeErrorType, setWriteErrorType] = useState<'rate_limit' | 'validation' | null>(null)
    const [pendingNotice, setPendingNotice] = useState<string | null>(null)
    const [pendingVisible, setPendingVisible] = useState(false)
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    /* 수정/삭제/좋아요 상태 */
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [submittingEdit, setSubmittingEdit] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [likingId, setLikingId] = useState<string | null>(null)

    /* 답글 상태 */
    const [replyToId, setReplyToId] = useState<string | null>(null)
    const [replyDraft, setReplyDraft] = useState('')
    const [submittingReply, setSubmittingReply] = useState(false)
    const [replyError, setReplyError] = useState<string | null>(null)
    const [repliesMap, setRepliesMap] = useState<Record<string, CommentWithLike[]>>({})
    const [expandedRepliesIds, setExpandedRepliesIds] = useState<Set<string>>(new Set())

    /* 신고 상태 */
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
    const [showReportModal, setShowReportModal] = useState(false)
    const [reportTargetComment, setReportTargetComment] = useState<{ id: string; body: string; authorNickname: string } | null>(null)

    /* 세이프티봇 상태 */
    const [safetyBotEnabled, setSafetyBotEnabled] = useState(true)
    const [safetyModalOpen, setSafetyModalOpen] = useState(false)

    /* 인증 보완: SSR에서 userId를 못 받은 경우 클라이언트에서 재조회 */
    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

    /* 세이프티봇 설정 초기화 (localStorage) */
    useEffect(() => {
        const stored = localStorage.getItem('safety_bot_enabled')
        setSafetyBotEnabled(stored !== 'false')
    }, [])

    /* 내가 신고한 댓글 ID 초기화 */
    useEffect(() => {
        if (!userId) return
        const param = issueId ? `issue_id=${issueId}` : `discussion_topic_id=${discussionTopicId}`
        fetch(`/api/comments/reported?${param}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
                if (d?.data?.length) setReportedIds(new Set(d.data))
            })
            .catch(() => {})
    }, [userId, issueId, discussionTopicId])

    const contextParam = issueId
        ? `issue_id=${issueId}`
        : `discussion_topic_id=${discussionTopicId}`

    /* 베스트 댓글 조회 */
    const loadBest = useCallback(async () => {
        try {
            const res = await fetch(`/api/comments?${contextParam}&best=true`)
            const json = await res.json()
            if (res.ok) setBestComments(json.data ?? [])
        } catch { /* 베스트 조회 실패는 무시 */ }
    }, [contextParam])

    /* 일반 댓글 목록 조회 */
    const loadComments = useCallback(async (
        currentOffset: number,
        append: boolean,
        currentSort: SortOption,
    ) => {
        try {
            const res = await fetch(
                `/api/comments?${contextParam}&limit=${PAGE_SIZE}&offset=${currentOffset}&sort=${currentSort}`
            )
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setComments((prev) => append ? [...prev, ...(json.data ?? [])] : (json.data ?? []))
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '댓글 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [contextParam])

    useEffect(() => {
        setLoading(true)
        loadBest()
        loadComments(0, false, sort)
    }, [loadBest, loadComments, sort])

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadComments(next, true, sort)
    }

    const handleSafetyBotConfirm = (enabled: boolean) => {
        setSafetyBotEnabled(enabled)
        setOffset(0)
        setLoading(true)
        loadBest()
        loadComments(0, false, sort)
    }

    /* Rate Limit 카운트다운 */
    const startRateLimitCountdown = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setRateLimitCountdown(RATE_LIMIT_SECONDS)
        countdownRef.current = setInterval(() => {
            setRateLimitCountdown((prev) => {
                if (prev <= 1) {
                    if (countdownRef.current) clearInterval(countdownRef.current)
                    setWriteError(null)
                    setWriteErrorType(null)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }, [])

    useEffect(() => () => {
        if (countdownRef.current) clearInterval(countdownRef.current)
    }, [])

    /* pendingNotice 4초 후 페이드아웃, 0.5초 트랜지션 후 DOM에서 제거 */
    useEffect(() => {
        if (!pendingNotice) return
        setPendingVisible(true)
        const fadeTimer = setTimeout(() => setPendingVisible(false), 4000)
        const removeTimer = setTimeout(() => setPendingNotice(null), 4500)
        return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer) }
    }, [pendingNotice])

    const redirectToLogin = () => {
        const currentPath = window.location.pathname
        if (confirm('로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?')) {
            window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
        }
    }

    /* 댓글 작성 */
    const handleWrite = async () => {
        if (!userId) { redirectToLogin(); return }
        if (!draft.trim() || submittingWrite || rateLimitCountdown > 0) return
        setSubmittingWrite(true)
        setWriteError(null)
        setWriteErrorType(null)
        setPendingNotice(null)
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: issueId ?? null,
                    discussion_topic_id: discussionTopicId ?? null,
                    content: draft.trim(),
                }),
            })
            const json = await res.json()
            if (res.status === 429) {
                setWriteErrorType('rate_limit')
                setWriteError(json.error ?? '잠시 후 다시 시도해 주세요.')
                startRateLimitCountdown()
                return
            }
            if (res.status === 400) {
                setWriteErrorType('validation')
                setWriteError(json.error ?? '입력 내용을 확인해 주세요.')
                return
            }
            if (!res.ok) { setWriteError(json.error ?? '오류가 발생했습니다.'); return }
            setDraft('')
            if (json.pending) {
                setPendingNotice(json.message ?? '등록되었습니다. 내용 검토 후 공개되거나 삭제될 수 있습니다.')
                if (json.data) {
                    setComments((prev) => [json.data, ...prev])
                    setTotal((t) => t + 1)
                }
                return
            }
            setOffset(0)
            loadBest()
            await loadComments(0, false, sort)
        } catch {
            setWriteError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.')
        } finally {
            setSubmittingWrite(false)
        }
    }

    /* 수정 */
    const handleEditStart = (comment: Comment) => { setEditingId(comment.id); setEditDraft(comment.body) }
    const handleEditCancel = () => { setEditingId(null); setEditDraft('') }

    const handleEditSave = async (commentId: string) => {
        if (!editDraft.trim() || submittingEdit) return
        setSubmittingEdit(true)
        try {
            const res = await fetch(`/api/comments/${commentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editDraft.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setEditingId(null)
            setEditDraft('')
            const updatedBody = editDraft.trim()
            const updater = (prev: CommentWithLike[]) =>
                prev.map((c) => c.id === commentId ? { ...c, body: updatedBody } : c)
            setComments(updater)
            setBestComments(updater)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, updater(rs)])
            ))
        } catch (e) {
            setError(e instanceof Error ? e.message : '수정 실패')
        } finally {
            setSubmittingEdit(false)
        }
    }

    /* 삭제 */
    const handleDelete = async (commentId: string) => {
        if (!window.confirm('댓글을 삭제하시겠습니까?')) return
        setDeletingId(commentId)
        try {
            const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            const isTopLevel = comments.some((c) => c.id === commentId)
            if (isTopLevel) {
                setComments((prev) => prev.filter((c) => c.id !== commentId))
                setBestComments((prev) => prev.filter((c) => c.id !== commentId))
                setTotal((prev) => Math.max(0, prev - 1))
            } else {
                /* 답글 삭제: repliesMap에서 제거 + 부모 replyCount 감소 */
                let parentId: string | null = null
                for (const [pid, replies] of Object.entries(repliesMap)) {
                    if (replies.some((r) => r.id === commentId)) { parentId = pid; break }
                }
                if (parentId) {
                    const pid = parentId
                    setRepliesMap((prev) => ({ ...prev, [pid]: prev[pid].filter((r) => r.id !== commentId) }))
                    setComments((prev) => prev.map((c) =>
                        c.id === pid ? { ...c, replyCount: Math.max(0, (c.replyCount ?? 0) - 1) } : c
                    ))
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    /* 좋아요/싫어요 토글 (낙관적 업데이트, 답글도 포함) */
    const handleLike = async (commentId: string, type: 'like' | 'dislike') => {
        if (!userId) { redirectToLogin(); return }
        if (likingId) return
        setLikingId(commentId)

        const prevComments = [...comments]
        const prevBestComments = [...bestComments]
        const prevRepliesMap = { ...repliesMap }

        const applyOptimistic = (list: CommentWithLike[]) =>
            list.map((c) => {
                if (c.id !== commentId) return c
                const cur = c.userLikeType
                let likes = c.like_count, dislikes = c.dislike_count
                let newType: typeof cur = type
                if (cur === type) {
                    newType = null
                    if (type === 'like') likes = Math.max(0, likes - 1)
                    else dislikes = Math.max(0, dislikes - 1)
                } else {
                    if (cur === 'like') { likes = Math.max(0, likes - 1); dislikes++ }
                    else if (cur === 'dislike') { dislikes = Math.max(0, dislikes - 1); likes++ }
                    else if (type === 'like') likes++
                    else dislikes++
                }
                return { ...c, like_count: likes, dislike_count: dislikes, userLikeType: newType }
            })

        setComments(applyOptimistic)
        setBestComments(applyOptimistic)
        setRepliesMap((prev) => Object.fromEntries(
            Object.entries(prev).map(([pid, rs]) => [pid, applyOptimistic(rs)])
        ))
        setTimeout(() => setLikingId(null), 300)

        try {
            const res = await fetch(`/api/comments/${commentId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            })
            const json = await res.json()
            if (!res.ok) {
                setComments(prevComments)
                setBestComments(prevBestComments)
                setRepliesMap(prevRepliesMap)
                return
            }
            const applyServer = (list: CommentWithLike[]) =>
                list.map((c) =>
                    c.id === commentId
                        ? { ...c, like_count: json.like_count, dislike_count: json.dislike_count, userLikeType: json.userType }
                        : c
                )
            setComments(applyServer)
            setBestComments(applyServer)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, applyServer(rs)])
            ))
        } catch {
            setComments(prevComments)
            setBestComments(prevBestComments)
            setRepliesMap(prevRepliesMap)
        }
    }

    /* 답글 폼 토글 */
    const handleReplyToggle = (commentId: string) => {
        if (replyToId === commentId) {
            setReplyToId(null)
            setReplyDraft('')
            setReplyError(null)
        } else {
            setReplyToId(commentId)
            setReplyDraft('')
            setReplyError(null)
        }
    }

    /* 답글 제출 */
    const handleReplySubmit = async (parentId: string) => {
        if (!replyDraft.trim() || submittingReply) return
        setSubmittingReply(true)
        setReplyError(null)
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: issueId ?? null,
                    discussion_topic_id: discussionTopicId ?? null,
                    parent_id: parentId,
                    content: replyDraft.trim(),
                }),
            })
            const json = await res.json()
            if (res.status === 429) {
                setReplyError(json.error ?? '잠시 후 다시 시도해 주세요.')
                startRateLimitCountdown()
                return
            }
            if (!res.ok) { setReplyError(json.error ?? '오류가 발생했습니다.'); return }
            setReplyDraft('')
            setReplyToId(null)
            if (!json.pending && json.data) {
                // POST 응답에는 display_name이 없으므로 GET으로 다시 조회해 닉네임 표시
                const repliesRes = await fetch(`/api/comments?${contextParam}&parent_id=${parentId}&limit=50&offset=0`)
                const repliesJson = await repliesRes.json()
                if (repliesRes.ok) {
                    setRepliesMap((prev) => ({ ...prev, [parentId]: repliesJson.data ?? [] }))
                }
                setExpandedRepliesIds((prev) => new Set([...prev, parentId]))
                setComments((prev) => prev.map((c) =>
                    c.id === parentId ? { ...c, replyCount: (c.replyCount ?? 0) + 1 } : c
                ))
            }
        } finally {
            setSubmittingReply(false)
        }
    }

    /* 답글 목록 토글 (미로드 시 API 조회) */
    const handleToggleReplies = async (commentId: string) => {
        if (expandedRepliesIds.has(commentId)) {
            setExpandedRepliesIds((prev) => new Set([...prev].filter((id) => id !== commentId)))
            return
        }
        if (!repliesMap[commentId]) {
            try {
                const res = await fetch(`/api/comments?${contextParam}&parent_id=${commentId}&limit=50&offset=0`)
                const json = await res.json()
                if (res.ok) setRepliesMap((prev) => ({ ...prev, [commentId]: json.data ?? [] }))
            } catch { /* 답글 조회 실패 무시 */ }
        }
        setExpandedRepliesIds((prev) => new Set([...prev, commentId]))
    }

    /* 신고 모달 열기 */
    const handleOpenReportModal = (comment: Comment) => {
        setReportTargetComment({
            id: comment.id,
            body: comment.body,
            authorNickname: authorLabel(comment),
        })
        setReplyToId(null)
        setReplyDraft('')
        setShowReportModal(true)
    }

    /* 신고: 모달에서 사유 선택 후 제출 (낙관적 업데이트) */
    const handleReport = async (commentId: string, reason: string) => {
        if (reportedIds.has(commentId)) return
        setReportedIds((prev) => new Set([...prev, commentId]))
        try {
            await fetch(`/api/comments/${commentId}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            })
        } catch { /* 신고 실패 시 상태 유지 (UX 단순화) */ }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex gap-3">
                            <div className="h-3 w-20 bg-border-muted rounded-full animate-pulse" />
                            <div className="h-3 w-12 bg-border-muted rounded-full animate-pulse" />
                        </div>
                        <div className="h-4 w-3/4 bg-border-muted rounded-full animate-pulse" />
                    </div>
                ))}
            </div>
        )
    }

    const hasMore = comments.length < total

    return (
        <>
            <div>
                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                {/* 작성 폼 */}
                <div className="pb-4 border-b border-border-muted mb-4">
                    {isClosed ? (
                        <p className="text-sm text-content-muted text-center py-3">
                            종료된 토론입니다. 댓글을 작성할 수 없습니다.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {writeErrorType === 'rate_limit' && writeError && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded text-sm">
                                    <span className="text-yellow-700 flex-1">{writeError}</span>
                                    {rateLimitCountdown > 0 && (
                                        <span className="text-yellow-800 font-semibold tabular-nums shrink-0">
                                            {rateLimitCountdown}초 후 재시도 가능
                                        </span>
                                    )}
                                </div>
                            )}
                            {writeErrorType !== 'rate_limit' && writeError && (
                                <p className="text-sm text-red-500">{writeError}</p>
                            )}
                            {pendingNotice && (
                                <div className={[
                                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 transition-all duration-500',
                                    pendingVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none',
                                ].join(' ')}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                    </svg>
                                    <p className="text-xs text-amber-700">{pendingNotice}</p>
                                </div>
                            )}
                            <textarea
                                value={draft}
                                onChange={(e) => {
                                    setDraft(e.target.value)
                                    if (writeErrorType === 'validation') {
                                        setWriteError(null)
                                        setWriteErrorType(null)
                                    }
                                }}
                                onClick={() => { if (!userId) redirectToLogin() }}
                                placeholder={userId ? '이 이슈에 대한 생각이나 반응을 자유롭게 남겨주세요.' : '댓글을 작성하려면 로그인 해주세요'}
                                maxLength={500}
                                rows={3}
                                className={[
                                    'w-full px-3 py-2 text-sm border rounded-xl resize-none focus:outline-none transition-colors',
                                    writeErrorType === 'validation'
                                        ? 'border-red-400 focus:border-red-400'
                                        : 'border-border focus:border-primary',
                                ].join(' ')}
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-content-muted">{draft.length} / 500</span>
                                <button
                                    onClick={handleWrite}
                                    disabled={!draft.trim() || submittingWrite || rateLimitCountdown > 0}
                                    className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submittingWrite ? '등록 중...' : '등록'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 총 댓글 수 + 정렬 표시 */}
                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-content-secondary">댓글 {total.toLocaleString()}개</p>
                    <p className="text-xs text-content-muted">최신순</p>
                </div>

                {/* 세이프티봇 안내 바 */}
                <div className="flex items-center justify-between px-3 py-2 mb-3 bg-surface-muted border border-border rounded-xl">
                    <p className="text-xs text-content-secondary flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                        </svg>
                        {safetyBotEnabled ? (
                            <><span className="text-green-500 font-medium">세이프티봇</span>이 악성 댓글로부터 보호합니다.</>
                        ) : (
                            <><span className="text-green-500 font-medium">세이프티봇</span>이 꺼져 있어요. 모든 댓글이 표시됩니다.</>
                        )}
                    </p>
                    <button
                        onClick={() => setSafetyModalOpen(true)}
                        className="flex items-center gap-1 text-xs text-content-secondary shrink-0 ml-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        <span>설정</span>
                    </button>
                </div>

                {safetyModalOpen && (
                    <SafetyBotSettingModal
                        onClose={() => setSafetyModalOpen(false)}
                        onConfirm={handleSafetyBotConfirm}
                    />
                )}

                {/* 베스트 댓글 */}
                {bestComments.length > 0 && (
                    <div className="mt-6 mb-4">
                        <p className="text-xs font-semibold text-primary mb-2 uppercase tracking-wide">
                            베스트 댓글
                        </p>
                        <ul className="space-y-2">
                            {bestComments.map((comment) => (
                                <CommentItem
                                    key={`best-${comment.id}`}
                                    comment={comment}
                                    userId={userId}
                                    isBest
                                    safetyBotEnabled={safetyBotEnabled}
                                    editingId={editingId}
                                    editDraft={editDraft}
                                    submittingEdit={submittingEdit}
                                    deletingId={deletingId}
                                    likingId={likingId}
                                    replyToId={replyToId}
                                    replyDraft={replyDraft}
                                    submittingReply={submittingReply}
                                    replyError={replyError}
                                    rateLimitCountdown={rateLimitCountdown}
                                    replies={repliesMap[comment.id]}
                                    repliesExpanded={expandedRepliesIds.has(comment.id)}
                                    reportedIds={reportedIds}
                                    onEditStart={handleEditStart}
                                    onEditCancel={handleEditCancel}
                                    onEditSave={handleEditSave}
                                    onDelete={handleDelete}
                                    onLike={handleLike}
                                    onReplyToggle={handleReplyToggle}
                                    onReplyDraftChange={setReplyDraft}
                                    onReplySubmit={handleReplySubmit}
                                    onToggleReplies={handleToggleReplies}
                                    onOpenReportModal={handleOpenReportModal}
                                    setEditDraft={setEditDraft}
                                />
                            ))}
                        </ul>
                        <hr className="mt-4 border-border-muted" />
                    </div>
                )}

                {/* 댓글 목록 */}
                {comments.length === 0 ? (
                    <p className="text-sm text-content-muted py-4 text-center">
                        첫 번째 댓글을 작성해보세요.
                    </p>
                ) : (
                    <ul className="divide-y divide-border-muted mb-4">
                        {comments.filter((c) => !bestComments.some((b) => b.id === c.id)).map((comment) => (
                            <CommentItem
                                key={comment.id}
                                comment={comment}
                                userId={userId}
                                safetyBotEnabled={safetyBotEnabled}
                                editingId={editingId}
                                editDraft={editDraft}
                                submittingEdit={submittingEdit}
                                deletingId={deletingId}
                                likingId={likingId}
                                replyToId={replyToId}
                                replyDraft={replyDraft}
                                submittingReply={submittingReply}
                                replyError={replyError}
                                rateLimitCountdown={rateLimitCountdown}
                                replies={repliesMap[comment.id]}
                                repliesExpanded={expandedRepliesIds.has(comment.id)}
                                reportedIds={reportedIds}
                                onEditStart={handleEditStart}
                                onEditCancel={handleEditCancel}
                                onEditSave={handleEditSave}
                                onDelete={handleDelete}
                                onLike={handleLike}
                                onReplyToggle={handleReplyToggle}
                                onReplyDraftChange={setReplyDraft}
                                onReplySubmit={handleReplySubmit}
                                onToggleReplies={handleToggleReplies}
                                onOpenReportModal={handleOpenReportModal}
                                setEditDraft={setEditDraft}
                            />
                        ))}
                    </ul>
                )}

                {/* 더보기 */}
                {hasMore && (
                    <div className="text-center mb-6 pt-4 border-t border-border-muted">
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="btn-neutral btn-sm disabled:opacity-50"
                        >
                            {loadingMore ? '불러오는 중...' : `더보기 (${total - comments.length}개 남음)`}
                        </button>
                    </div>
                )}
            </div>

            {/* 신고 모달 */}
            {showReportModal && reportTargetComment && (
                <ReportModal
                    isOpen={showReportModal}
                    onClose={() => setShowReportModal(false)}
                    comment={reportTargetComment}
                    onReport={handleReport}
                />
            )}
        </>
    )
}

/* ─── 댓글 단일 아이템 컴포넌트 ─── */

interface CommentItemProps {
    comment: CommentWithLike
    userId: string | null
    isBest?: boolean
    isReply?: boolean
    safetyBotEnabled: boolean
    editingId: string | null
    editDraft: string
    submittingEdit: boolean
    deletingId: string | null
    likingId: string | null
    /* 답글 관련 (최상위 댓글에서만 사용) */
    replyToId?: string | null
    replyDraft?: string
    submittingReply?: boolean
    replyError?: string | null
    rateLimitCountdown?: number
    replies?: CommentWithLike[]
    repliesExpanded?: boolean
    /* 신고 */
    reportedIds: Set<string>
    onEditStart: (c: Comment) => void
    onEditCancel: () => void
    onEditSave: (id: string) => void
    onDelete: (id: string) => void
    onLike: (id: string, type: 'like' | 'dislike') => void
    onReplyToggle?: (id: string) => void
    onReplyDraftChange?: (v: string) => void
    onReplySubmit?: (parentId: string) => void
    onToggleReplies?: (id: string) => void
    onOpenReportModal: (comment: Comment) => void
    setEditDraft: (v: string) => void
}

function CommentItem({
    comment, userId, isBest, isReply, safetyBotEnabled,
    editingId, editDraft, submittingEdit, deletingId, likingId,
    replyToId, replyDraft, submittingReply, replyError, rateLimitCountdown,
    replies, repliesExpanded,
    reportedIds,
    onEditStart, onEditCancel, onEditSave, onDelete, onLike,
    onReplyToggle, onReplyDraftChange, onReplySubmit, onToggleReplies,
    onOpenReportModal, setEditDraft,
}: CommentItemProps) {

    const isMine = userId === comment.user_id
    const isEditing = editingId === comment.id
    const isDeleting = deletingId === comment.id
    const isLiking = likingId === comment.id
    const myType = comment.userLikeType ?? null
    const replyCount = comment.replyCount ?? 0
    const isReplyFormOpen = replyToId === comment.id
    const hasReplies = replyCount > 0 || ((replies?.length ?? 0) > 0)
    const isReported = reportedIds.has(comment.id)

    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [menuOpen])

    return (
        <li className={[
            'py-4',
            isBest ? 'px-3 bg-amber-50/50 rounded-xl border border-amber-100' : '',
            isReply ? 'py-3' : '',
        ].join(' ')}>
            {/* 작성자 + 시간 + 본인 액션 + ... 메뉴 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                    <NicknameAvatar name={authorLabel(comment)} />
                    <span className="text-xs text-content-secondary">{authorLabel(comment)}</span>
                    <span className="text-xs text-content-muted">· {formatDate(comment.created_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                    {isReported && (
                        <span className="text-xs text-red-500 border border-red-300 px-1.5 py-0.5 rounded-full">신고완료</span>
                    )}
                    {isMine && !isEditing && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEditStart(comment)}
                                className="text-xs text-content-secondary hover:text-content-primary transition-colors"
                            >
                                수정
                            </button>
                            <button
                                onClick={() => onDelete(comment.id)}
                                disabled={isDeleting}
                                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                            >
                                {isDeleting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    )}
                    {/* 더보기 메뉴 (타인 댓글·답글 + 로그인 시) */}
                    {!isMine && userId && comment.visibility !== 'deleted' && (comment.visibility !== 'pending_review' || !safetyBotEnabled) && (
                        <div className="relative" ref={menuRef}>
                            {!isReported && (
                                <button
                                    onClick={() => setMenuOpen((prev) => !prev)}
                                    className="text-xs text-content-muted hover:text-content-secondary px-1 leading-none transition-colors"
                                    aria-label="더보기"
                                >
                                    ⋮
                                </button>
                            )}
                            {menuOpen && (
                                <div className="absolute right-0 top-6 z-10 w-28 bg-surface border border-border rounded-xl shadow-card py-1">
                                    <button
                                        onClick={() => { setMenuOpen(false); onOpenReportModal(comment) }}
                                        className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-surface-muted transition-colors"
                                    >
                                        신고하기
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 본문 또는 수정 폼 */}
            {isReported ? (
                <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-content-muted shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-content-muted">검토 중인 댓글입니다.</p>
                </div>
            ) : comment.visibility === 'deleted' ? (
                <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-content-muted shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-content-muted">작성자에 의해 삭제된 댓글입니다.</p>
                </div>
            ) : isEditing ? (
                <div className="mt-2 space-y-2">
                    <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none focus:outline-none focus:border-primary transition-colors"
                    />
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={onEditCancel}
                            className="btn-neutral btn-sm text-xs"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => onEditSave(comment.id)}
                            disabled={!editDraft.trim() || submittingEdit}
                            className="btn-primary btn-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submittingEdit ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            ) : comment.visibility === 'pending_review' && !isMine && safetyBotEnabled ? (
                <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-content-muted shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-content-muted">세이프티봇이 부적절한 표현을 감지한 댓글입니다.</p>
                </div>
            ) : comment.visibility === 'pending_review' && isMine ? (
                <p className={['text-content-primary leading-relaxed', 'text-sm'].join(' ')}>
                    {comment.body}
                </p>
            ) : (
                <p className={['text-content-primary leading-relaxed', 'text-sm'].join(' ')}>
                    {comment.body}
                </p>
            )}

            {/* 답글(좌) + 좋아요/싫어요(우) */}
            {!isEditing && !isReported && comment.visibility !== 'deleted' && (isMine || comment.visibility !== 'pending_review' || !safetyBotEnabled) && (
                <div className="flex items-center justify-between mt-2">
                    {/* 답글 버튼 */}
                    <div>
                        {!isReply && userId && isMine && hasReplies && onToggleReplies && (
                            /* 본인 댓글: 답글 있을 때만 펼치기 */
                            <button
                                onClick={() => onToggleReplies(comment.id)}
                                className="text-xs text-content-muted hover:text-content-secondary transition-colors"
                            >
                                {`답글 ${replyCount}`}
                            </button>
                        )}
                        {!isReply && userId && !isMine && (
                            /* 타인 댓글: 항상 답글 버튼 */
                            <button
                                onClick={() => hasReplies && onToggleReplies
                                    ? onToggleReplies(comment.id)
                                    : onReplyToggle?.(comment.id)
                                }
                                className="text-xs text-content-muted hover:text-content-secondary transition-colors"
                            >
                                {hasReplies ? `답글 ${replyCount}` : '답글'}
                            </button>
                        )}
                    </div>
                    {/* 좋아요/싫어요 — 본인 댓글은 숫자만, 타인은 클릭 가능 */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => !isMine && onLike(comment.id, 'like')}
                            disabled={isMine || isLiking}
                            className={[
                                'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors bg-surface',
                                myType === 'like'
                                    ? 'border-primary-muted text-primary font-semibold'
                                    : 'border-border text-content-secondary hover:border-border-strong',
                                isMine ? 'cursor-default' : isLiking ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            ].join(' ')}
                        >
                            <span>👍</span>
                            <span>{comment.like_count}</span>
                        </button>
                        <button
                            onClick={() => !isMine && onLike(comment.id, 'dislike')}
                            disabled={isMine || isLiking}
                            className={[
                                'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors bg-surface',
                                myType === 'dislike'
                                    ? 'border-border-strong text-content-secondary font-semibold'
                                    : 'border-border text-content-secondary hover:border-border-strong',
                                isMine ? 'cursor-default' : isLiking ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            ].join(' ')}
                        >
                            <span>👎</span>
                            <span>{comment.dislike_count}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 인라인 답글 작성 폼 */}
            {!isReply && isReplyFormOpen && onReplyDraftChange && onReplySubmit && (
                <div className="mt-3 pl-4 border-l-2 border-border-muted">
                    {replyError && <p className="text-xs text-red-500 mb-1">{replyError}</p>}
                    <textarea
                        value={replyDraft ?? ''}
                        onChange={(e) => onReplyDraftChange(e.target.value)}
                        placeholder="답글을 입력하세요"
                        rows={2}
                        maxLength={500}
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none focus:outline-none focus:border-primary transition-colors"
                    />
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-content-muted">{(replyDraft ?? '').length} / 500</span>
                        <button
                            onClick={() => onReplySubmit(comment.id)}
                            disabled={!replyDraft?.trim() || submittingReply || (rateLimitCountdown ?? 0) > 0}
                            className="btn-primary btn-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submittingReply ? '등록 중...' : '등록'}
                        </button>
                    </div>
                </div>
            )}

            {/* 답글 목록 */}
            {!isReply && repliesExpanded && replies && replies.length > 0 && (
                <ul className="mt-2 pl-8 border-l border-border-muted divide-y divide-border-muted">
                    {replies.map((reply) => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            userId={userId}
                            isReply
                            safetyBotEnabled={safetyBotEnabled}
                            editingId={editingId}
                            editDraft={editDraft}
                            submittingEdit={submittingEdit}
                            deletingId={deletingId}
                            likingId={likingId}
                            reportedIds={reportedIds}
                            onEditStart={onEditStart}
                            onEditCancel={onEditCancel}
                            onEditSave={onEditSave}
                            onDelete={onDelete}
                            onLike={onLike}
                            onOpenReportModal={onOpenReportModal}
                            setEditDraft={setEditDraft}
                        />
                    ))}
                </ul>
            )}
        </li>
    )
}
