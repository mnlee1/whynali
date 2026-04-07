'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactionType } from '@/types'

interface ReactionDropdownProps {
    issueId: string
    userId: string | null
}

type CountMap = Partial<Record<ReactionType, number>>

const REACTION_META: { type: ReactionType; emoji: string; label: string }[] = [
    { type: '좋아요',  emoji: '👍', label: '좋아요' },
    { type: '싫어요',  emoji: '👎', label: '싫어요' },
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
            }
        } catch {}
    }, [issueId])

    useEffect(() => { loadReactions() }, [loadReactions])

    /* 외부 클릭 시 닫기 */
    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) document.addEventListener('mousedown', handleOutside)
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
                setCounts(json.counts ?? {})
                setUserReaction(json.userReaction ?? null)
            }
        } catch {}
        finally {
            setSubmitting(false)
            setOpen(false)
        }
    }

    const selectedMeta = REACTION_META.find((r) => r.type === userReaction)
    const totalCount = Object.values(counts).reduce((s, c) => s + (c ?? 0), 0)

    return (
        <div className="relative" ref={ref}>
            {/* 트리거 버튼 */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={[
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors',
                    userReaction
                        ? 'border-primary-muted bg-primary-light text-primary font-medium'
                        : 'border-border bg-surface text-content-secondary hover:bg-surface-subtle hover:text-content-primary',
                ].join(' ')}
            >
                <span>{selectedMeta ? selectedMeta.emoji : '😊'}</span>
                <span>{userReaction ? selectedMeta?.label : '감정표현'}</span>
                {totalCount > 0 && (
                    <span className="text-content-muted">{totalCount.toLocaleString()}</span>
                )}
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>

            {/* 드롭다운 */}
            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-50 bg-surface border border-border rounded-2xl shadow-lg p-2 flex gap-1 flex-wrap w-max max-w-[260px]">
                    {REACTION_META.map(({ type, emoji, label }) => {
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
                                    'flex flex-col items-center px-2.5 py-2 rounded-xl border transition-all min-w-[52px]',
                                    selected
                                        ? 'border-primary-muted bg-primary-light scale-105'
                                        : 'border-border bg-surface hover:border-border-strong hover:scale-105',
                                    submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                                ].join(' ')}
                            >
                                <span className="text-xl leading-none">{emoji}</span>
                                <span className={`text-xs mt-0.5 ${selected ? 'text-primary font-semibold' : 'text-content-secondary'}`}>
                                    {label}
                                </span>
                                <span className={`text-xs tabular-nums ${selected ? 'text-primary font-medium' : 'text-content-muted'}`}>
                                    {count.toLocaleString()}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
