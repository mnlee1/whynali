'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactionType } from '@/types'

interface ReactionDropdownProps {
    issueId: string
    userId: string | null
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

export default function ReactionDropdown({ issueId, userId }: ReactionDropdownProps) {
    const [open, setOpen] = useState(false)
    const [counts, setCounts] = useState<CountMap>({})
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

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
            if (e.detail?.issueId === issueId) {
                console.log('[ReactionDropdown] Received reactionUpdated event')
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

    const handleClick = async (type: ReactionType) => {
        if (!userId) {
            if (confirm('로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?')) {
                window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
            }
            return
        }
        if (submitting) return
        setSubmitting(true)
        try {
            const res = await fetch('/api/reactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: issueId, type }),
            })
            const json = await res.json()
            if (res.ok) {
                console.log('[ReactionDropdown] API success:', json)
                await loadReactions()
                console.log('[ReactionDropdown] loadReactions completed')
                window.dispatchEvent(new CustomEvent('reactionUpdated', { detail: { issueId } }))
            } else {
                console.error('[ReactionDropdown] handleClick API failed:', res.status, json)
            }
        } catch (err) {
            console.error('[ReactionDropdown] handleClick error:', err)
        }
        finally {
            setSubmitting(false)
            setOpen(false)
        }
    }

    const totalCount = Object.values(counts).reduce((s, c) => s + (c ?? 0), 0)
    const topReactions = REACTION_META
        .map((r) => ({ ...r, count: counts[r.type] ?? 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)

    return (
        <div className="relative" ref={ref}>
            {/* 트리거 버튼 */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center pr-2.5 py-1 text-xs transition-colors"
            >
                {/* 이모지 겹침 영역 */}
                <span className="flex items-center">
                    {topReactions.length > 0 ? (
                        topReactions.map((r, i) => (
                            <span
                                key={r.type}
                                className="text-lg leading-tight inline-block"
                                style={{ marginLeft: i > 0 ? '-6px' : 0, zIndex: topReactions.length - i, position: 'relative', lineHeight: '1.3' }}
                            >
                                {r.emoji}
                            </span>
                        ))
                    ) : (
                        <span className="text-lg leading-tight inline-block" style={{ lineHeight: '1.3' }}>😊</span>
                    )}
                </span>
                {/* 총 수치 */}
                {totalCount > 0 && (
                    <span className={[
                        'tabular-nums',
                        userReaction ? 'text-primary font-semibold' : 'text-content-secondary font-normal',
                    ].join(' ')}>{totalCount.toLocaleString()}</span>
                )}
            </button>

            {/* 드롭다운 */}
            {open && (
                <div className="absolute left-0 top-full z-50 bg-surface border border-border rounded-2xl shadow-lg p-2 w-[280px]">
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
                                        'flex flex-col items-center px-3 py-2 rounded-xl border transition-all w-full',
                                        selected
                                            ? 'border-primary-muted scale-105'
                                            : 'border-border bg-surface',
                                        submitting
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-border-strong hover:scale-105 cursor-pointer',
                                    ].join(' ')}
                                >
                                    <span className="text-xl leading-none">{emoji}</span>
                                    <span className={[
                                        'text-xs mt-1',
                                        selected ? 'text-primary font-semibold' : 'text-content-secondary',
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
                                        'flex flex-col items-center px-3 py-2 rounded-xl border transition-all w-full',
                                        selected
                                            ? 'border-primary-muted scale-105'
                                            : 'border-border bg-surface',
                                        submitting
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-border-strong hover:scale-105 cursor-pointer',
                                    ].join(' ')}
                                >
                                    <span className="text-xl leading-none">{emoji}</span>
                                    <span className={[
                                        'text-xs mt-1',
                                        selected ? 'text-primary font-semibold' : 'text-content-secondary',
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
        </div>
    )
}
