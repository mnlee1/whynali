'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus } from 'lucide-react'
import type { ReactionType } from '@/types'
import { goToLoginWithPendingAction } from '@/lib/pendingAction'
import { usePendingAction } from '@/hooks/usePendingAction'
import LoginPromptModal from '@/components/common/LoginPromptModal'

interface ReactionDropdownProps {
    issueId: string
    userId: string | null
    align?: 'left' | 'right'
    layout?: 'inline' | 'block' // block: 아이콘 위 + 카운트 아래 (좌측 레일용)
    panelDirection?: 'down' | 'right' | 'up' // right: 좌측 레일용, up: 하단 캡슐바용(화면 밖으로 안 잘리게 위로 펼침)
}

type CountMap = Partial<Record<ReactionType, number>>

const REACTION_META: { type: ReactionType; emoji: string; label: string }[] = [
    { type: '좋아요',  emoji: '😊', label: '좋아요' },
    { type: '싫어요',  emoji: '😞', label: '싫어요' },
    { type: '화나요',  emoji: '😡', label: '화나요' },
    { type: '팝콘각',  emoji: '🍿', label: '팝콘각' },
    { type: '응원',    emoji: '📣', label: '응원' },
    { type: '애도',    emoji: '🕯️', label: '애도' },
    { type: '사이다',  emoji: '🥤', label: '사이다' },
]

export default function ReactionDropdown({ issueId, userId, align = 'left', layout = 'inline', panelDirection = 'down' }: ReactionDropdownProps) {
    const [open, setOpen] = useState(false)
    const [counts, setCounts] = useState<CountMap>({})
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [loginPrompt, setLoginPrompt] = useState<ReactionType | null>(null)
    const ref = useRef<HTMLDivElement>(null)
    const instanceId = useMemo(() => Math.random().toString(36).slice(2), [])

    const loadReactions = useCallback(async () => {
        try {
            const res = await fetch(`/api/reactions?issue_id=${issueId}`)
            const json = await res.json()
            if (res.ok) {
                setCounts(json.counts ?? {})
                setUserReaction(json.userReaction ?? null)
            } else {
                console.error('[ReactionDropdown] loadReactions failed:', res.status, json)
            }
        } catch (err) {
            console.error('[ReactionDropdown] loadReactions error:', err)
        }
    }, [issueId])

    useEffect(() => { loadReactions() }, [loadReactions])

    useEffect(() => {
        const handleReactionUpdate = (e: CustomEvent) => {
            if (e.detail?.issueId === issueId && e.detail?.source !== instanceId) {
                loadReactions()
            }
        }
        window.addEventListener('reactionUpdated', handleReactionUpdate as EventListener)
        return () => window.removeEventListener('reactionUpdated', handleReactionUpdate as EventListener)
    }, [issueId, loadReactions])

    /* 외부 클릭 시 닫기 */
    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            setTimeout(() => {
                document.addEventListener('mousedown', handleOutside)
            }, 0)
        }
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [open])

    const handleClick = (type: ReactionType) => {
        if (!userId) {
            setLoginPrompt(type)
            return
        }
        submitReaction(type)
    }

    usePendingAction(
        'reaction',
        (action) => action.issueId === issueId,
        (action) => submitReaction(action.reactionType),
        !!userId
    )

    const submitReaction = async (type: ReactionType) => {
        if (submitting) return

        // 낙관적 업데이트
        const prevCounts = { ...counts }
        const prevUserReaction = userReaction
        const newCounts = { ...counts }
        if (userReaction === type) {
            newCounts[type] = Math.max(0, (newCounts[type] ?? 0) - 1)
            setCounts(newCounts)
            setUserReaction(null)
        } else {
            if (userReaction) newCounts[userReaction] = Math.max(0, (newCounts[userReaction] ?? 0) - 1)
            newCounts[type] = (newCounts[type] ?? 0) + 1
            setCounts(newCounts)
            setUserReaction(type)
        }

        setSubmitting(true)
        try {
            const res = await fetch('/api/reactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: issueId, type }),
            })
            const json = await res.json()
            if (res.ok) {
                await loadReactions()
                window.dispatchEvent(new CustomEvent('reactionUpdated', { detail: { issueId, source: instanceId } }))
            } else {
                setCounts(prevCounts)
                setUserReaction(prevUserReaction)
            }
        } catch {
            setCounts(prevCounts)
            setUserReaction(prevUserReaction)
        } finally {
            setSubmitting(false)
            setOpen(false)
        }
    }

    const totalCount = Object.values(counts).reduce((s, c) => s + (c ?? 0), 0)
    const topReaction = REACTION_META
        .map((r) => ({ ...r, count: counts[r.type] ?? 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)[0]
    const selectedMeta = REACTION_META.find((r) => r.type === userReaction)
    const displayEmoji = selectedMeta?.emoji ?? topReaction?.emoji ?? '😊'

    return (
        <div className="relative" ref={ref}>
            {/* 트리거 버튼 */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={layout === 'block'
                    ? 'relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-surface-subtle transition-colors'
                    : 'relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-surface-subtle transition-colors'}
            >
                <span className="text-lg leading-none inline-flex items-center justify-center w-8 h-8 rounded-full">
                    {displayEmoji}
                </span>
                {/* 카운트/유도 배지 */}
                {totalCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-white text-[11px] font-extrabold flex items-center justify-center leading-none tabular-nums">
                        {totalCount > 99 ? '99+' : totalCount}
                    </span>
                ) : (
                    <span className="absolute -top-1 -right-1 w-[17px] h-[17px] rounded-full bg-primary text-white">
                        <Plus className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                )}
            </button>

            {/* 드롭다운 */}
            {open && (
                <div className={
                    panelDirection === 'right'
                        ? 'absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 bg-surface border border-border rounded-xl shadow-card p-2 w-[280px]'
                        : panelDirection === 'up'
                        ? `absolute bottom-full mb-2 z-50 bg-surface border border-border rounded-xl shadow-card p-2 w-[280px] ${align === 'right' ? 'right-0' : 'left-0'}`
                        : `absolute top-full z-50 bg-surface border border-border rounded-xl shadow-card p-2 w-[280px] ${align === 'right' ? 'right-0' : 'left-0'}`
                }>
                    <div className="grid grid-cols-4 gap-1.5">
                        {REACTION_META.slice(0, 4).map(({ type, emoji, label }) => {
                            const count = counts[type] ?? 0
                            const selected = userReaction === type
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleClick(type)}
                                    disabled={submitting}
                                    title={label}
                                    className={[
                                        'flex flex-col items-center px-3 py-2 rounded-xl transition-all w-full',
                                        selected
                                            ? 'bg-primary-light scale-105'
                                            : '',
                                        submitting
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:bg-surface-subtle hover:scale-105 cursor-pointer',
                                    ].join(' ')}
                                >
                                    <span className="text-xl leading-none">{emoji}</span>
                                    <span className={[
                                        'text-xs mt-1 font-semibold',
                                        selected ? 'text-primary' : 'text-content-secondary',
                                    ].join(' ')}>
                                        {label}
                                    </span>
                                    <span className={[
                                        'text-xs tabular-nums',
                                        selected ? 'text-primary font-medium' : 'text-content-muted',
                                    ].join(' ')}>
                                        {count.toLocaleString()}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                        {REACTION_META.slice(4).map(({ type, emoji, label }) => {
                            const count = counts[type] ?? 0
                            const selected = userReaction === type
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleClick(type)}
                                    disabled={submitting}
                                    title={label}
                                    className={[
                                        'flex flex-col items-center px-3 py-2 rounded-xl transition-all w-full',
                                        selected
                                            ? 'bg-primary-light scale-105'
                                            : '',
                                        submitting
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:bg-surface-subtle hover:scale-105 cursor-pointer',
                                    ].join(' ')}
                                >
                                    <span className="text-xl leading-none">{emoji}</span>
                                    <span className={[
                                        'text-xs mt-1 font-semibold',
                                        selected ? 'text-primary' : 'text-content-secondary',
                                    ].join(' ')}>
                                        {label}
                                    </span>
                                    <span className={[
                                        'text-xs tabular-nums',
                                        selected ? 'text-primary font-medium' : 'text-content-muted',
                                    ].join(' ')}>
                                        {count.toLocaleString()}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <LoginPromptModal
                isOpen={!!loginPrompt}
                description="반응을 남기려면 로그인이 필요해요."
                onClose={() => setLoginPrompt(null)}
                onConfirm={() => {
                    if (!loginPrompt) return
                    goToLoginWithPendingAction({ type: 'reaction', issueId, reactionType: loginPrompt })
                }}
            />
        </div>
    )
}
