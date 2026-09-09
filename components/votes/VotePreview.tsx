/**
 * components/votes/VotePreview.tsx
 *
 * [지금 뜨는 투표 — 홈 투표 섹션]
 *
 * 좌측에 화력/참여 기준 대표 투표 1개를 큰 카드(질문+선택지+투표 버튼)로,
 * 우측에 나머지 투표 최대 3개를 이미지+제목+참여 정보의 작은 카드 3열로 나란히 보여준다.
 * 헤더에는 이번 주 누적 참여 수를 말풍선 배지로, "더보기"로 전체 투표 목록 진입 동선을 둔다.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Sparkles, Eye } from 'lucide-react'
import type { Vote, VoteChoice } from '@/types/index'
import type { Issue } from '@/types/issue'
import { savePendingAction } from '@/lib/pendingAction'
import { openLoginModal } from '@/lib/loginModalStore'
import { usePendingAction } from '@/hooks/usePendingAction'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: {
        id: string
        title: string
        category?: Issue['category']
        topic_description?: Issue['topic_description']
        brief_summary?: Issue['brief_summary']
        heat_index?: number | null
        thumbnail_urls?: string[] | null
        primary_thumbnail_index?: number | null
    } | null
}

type UserVotes = Record<string, string>

// 좌측 대표 투표 1개 + 우측 다른 투표 카드 3개
const OTHER_VOTES_COUNT = 6
const OTHER_VOTES_PER_PAGE = 3
const MAX_VOTES_SHOWN = 1 + OTHER_VOTES_COUNT

function selectDisplayVotes(votes: VoteWithChoices[]): VoteWithChoices[] {
    const deduped = [...new Map(votes.map(v => [v.id, v])).values()]
    const sorted = deduped.sort((a, b) => {
        // 진행중 우선 → 참여자 수 내림차순 → 동일 조건이면 연결된 이슈의 화력(heat_index) 내림차순
        if (a.phase !== b.phase) return a.phase === '진행중' ? -1 : 1
        const countDiff = totalVoteCount(b) - totalVoteCount(a)
        if (countDiff !== 0) return countDiff
        return (b.issues?.heat_index ?? 0) - (a.issues?.heat_index ?? 0)
    })

    // 같은 이슈에서 나온 투표(예: 같은 사건에 대한 서로 다른 질문)는 하나만 남긴다
    const seenIssueIds = new Set<string>()
    const result: VoteWithChoices[] = []
    for (const vote of sorted) {
        const issueId = vote.issues?.id
        if (issueId) {
            if (seenIssueIds.has(issueId)) continue
            seenIssueIds.add(issueId)
        }
        result.push(vote)
        if (result.length >= MAX_VOTES_SHOWN) break
    }
    return result
}

function totalVoteCount(vote: VoteWithChoices): number {
    return (vote.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0)
}

// 아카이브 카드용: 표를 가장 많이 받은 선택지 (동률이면 먼저 등록된 순).
function topChoice(vote: VoteWithChoices): VoteChoice | null {
    const choices = vote.vote_choices ?? []
    if (choices.length === 0) return null
    return [...choices].sort((a, b) => b.count - a.count)[0]
}

// "현재 N명이 보는 중" 추정치 — 실제 동시접속 트래킹이 없어, 투표 id를 시드로 30~279 범위의
// 안정적인(매 렌더마다 값이 안 흔들리는) 값을 뽑는다. 실참여수가 아닌 장식용 신호다.
function estimateViewers(voteId: string): number {
    let hash = 0
    for (let i = 0; i < voteId.length; i++) hash = (hash * 31 + voteId.charCodeAt(i)) >>> 0
    return 30 + (hash % 250)
}

interface Props {
    initialVotes?: VoteWithChoices[]
}

export default function VotePreview({ initialVotes }: Props) {
    const [allVotes, setAllVotes] = useState<VoteWithChoices[]>(initialVotes ?? [])
    const [loading, setLoading] = useState(!initialVotes)
    const [userVotes, setUserVotes] = useState<UserVotes>({})
    const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState<Record<string, boolean>>({})
    const [userId, setUserId] = useState<string | null>(null)
    const [summaryPopover, setSummaryPopover] = useState<{ voteId: string; top?: number; bottom?: number; left: number } | null>(null)
    const activeSummaryButtonRef = useRef<HTMLElement | null>(null)
    const summaryPopoverRef = useRef<HTMLDivElement>(null)
    const [otherPage, setOtherPage] = useState(0)
    const [otherDirection, setOtherDirection] = useState(1)
    const isDraggingRef = useRef(false)

    const SUMMARY_POPOVER_WIDTH = 288

    const toggleSummary = (voteId: string, btn: HTMLElement) => {
        if (summaryPopover?.voteId === voteId) {
            setSummaryPopover(null)
            return
        }
        activeSummaryButtonRef.current = btn
        const rect = btn.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const left = Math.min(
            Math.max(rect.right - SUMMARY_POPOVER_WIDTH, 8),
            window.innerWidth - SUMMARY_POPOVER_WIDTH - 8
        )
        setSummaryPopover(
            spaceBelow < 220
                ? { voteId, bottom: window.innerHeight - rect.top + 8, left }
                : { voteId, top: rect.bottom + 8, left }
        )
    }

    // 팝오버 바깥 클릭/스크롤 시 닫기
    useEffect(() => {
        if (!summaryPopover) return
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            if (summaryPopoverRef.current?.contains(target)) return
            if (activeSummaryButtonRef.current?.contains(target)) return
            setSummaryPopover(null)
        }
        const handleScroll = () => setSummaryPopover(null)
        document.addEventListener('mousedown', handleClickOutside)
        window.addEventListener('scroll', handleScroll, true)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            window.removeEventListener('scroll', handleScroll, true)
        }
    }, [summaryPopover])

    useEffect(() => {
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [])

    useEffect(() => {
        async function loadUserVotes() {
            try {
                const res = await fetch('/api/votes?limit=50')
                if (!res.ok) return
                const json = await res.json()
                setUserVotes(json.userVotes ?? {})
                setAllVotes(json.data ?? [])
            } catch {
                // 실패 시 미투표 상태로 유지
            } finally {
                if (!initialVotes) setLoading(false)
            }
        }
        loadUserVotes()
    }, [initialVotes])

    const submitVote = async (voteId: string, choiceId: string) => {
        setSubmitting(prev => ({ ...prev, [voteId]: true }))
        try {
            const res = await fetch(`/api/votes/${voteId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vote_choice_id: choiceId }),
            })
            if (res.status === 401) {
                const issueId = allVotes.find(v => v.id === voteId)?.issues?.id
                if (issueId) {
                    savePendingAction({ type: 'vote', issueId, voteId, choiceId })
                    openLoginModal()
                }
                return
            }
            if (res.ok || res.status === 201) {
                setUserVotes(prev => ({ ...prev, [voteId]: choiceId }))
                setAllVotes(prev => prev.map(v => {
                    if (v.id !== voteId) return v
                    return {
                        ...v,
                        vote_choices: v.vote_choices.map(c =>
                            c.id === choiceId ? { ...c, count: c.count + 1 } : c
                        ),
                    }
                }))
            }
        } catch {
            // silent
        } finally {
            setSubmitting(prev => ({ ...prev, [voteId]: false }))
        }
    }

    usePendingAction(
        'vote',
        (action) => allVotes.some(v => v.id === action.voteId),
        (action) => submitVote(action.voteId, action.choiceId),
        !loading && !!userId
    )

    if (loading) {
        return (
            <section className="flex flex-col min-w-0 !mt-[72px]">
                <h2 className="text-[24px] font-bold text-content-primary mb-5">지금 뜨는 투표</h2>
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
                    <div className="h-[420px] bg-border-muted rounded-xl animate-pulse" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-56 bg-border-muted rounded-xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </section>
        )
    }

    const displayVotes = selectDisplayVotes(allVotes)

    if (displayVotes.length === 0) {
        return (
            <section className="flex flex-col min-w-0 !mt-[72px]">
                <h2 className="text-[24px] font-bold text-content-primary mb-4">지금 뜨는 투표</h2>
                <div className="h-40 bg-border-muted rounded-xl flex items-center justify-center">
                    <p className="text-content-muted text-sm">진행 중인 투표가 없어요.</p>
                </div>
            </section>
        )
    }

    const [featured, ...others] = displayVotes
    const otherTotalPages = Math.ceil(others.length / OTHER_VOTES_PER_PAGE)
    const visibleOthers = others.slice(otherPage * OTHER_VOTES_PER_PAGE, otherPage * OTHER_VOTES_PER_PAGE + OTHER_VOTES_PER_PAGE)
    const goOtherPrev = () => { setOtherDirection(-1); setOtherPage(p => (p - 1 + otherTotalPages) % otherTotalPages) }
    const goOtherNext = () => { setOtherDirection(1); setOtherPage(p => (p + 1) % otherTotalPages) }
    const choices = featured.vote_choices ?? []
    const featuredIssueId = featured.issues?.id ?? ''
    const featuredUserChoiceId = userVotes[featured.id]
    const featuredHasVoted = !!featuredUserChoiceId
    const featuredIsActive = featured.phase === '진행중'
    const featuredShowResults = featuredHasVoted || !featuredIsActive
    const featuredTotal = totalVoteCount(featured)
    const featuredSortedByCount = [...choices].sort((a, b) => b.count - a.count)
    const featuredSelectedChoiceId = selectedChoices[featured.id]
    const featuredSubmitting = submitting[featured.id] ?? false
    const featuredThreeLine = featured.issues?.brief_summary?.threeLine ?? []
    const featuredHasSummary = featuredThreeLine.length > 0
    const isSummaryOpen = !!summaryPopover
    const summaryVote = displayVotes.find(v => v.id === summaryPopover?.voteId)
    const summaryVoteThreeLine = summaryVote?.issues?.brief_summary?.threeLine ?? []

    return (
        <section className="flex flex-col min-w-0 !mt-[72px]">
            {/* 헤더: 타이틀 + 태그라인 */}
            <div className="mb-5">
                <h2 className="text-[24px] font-bold text-content-primary">지금 뜨는 투표</h2>
                <p className="text-[14.5px] text-content-secondary mt-1">다양한 생각을 투표로 나누고 실시간 반응을 확인해보세요</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
                {/* 좌측: 대표 투표 (질문 + 선택지/결과 + 투표 버튼) */}
                {featuredIssueId && (
                    <div className="w-full min-w-0 bg-white border border-border rounded-xl shadow-card [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card-hover [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1.5 transition-[box-shadow,transform] duration-300 ease-out flex flex-col">
                        <div className="relative p-6 flex flex-col">
                            {/* AI 3줄요약 버튼 (있을 때만) — 타이틀 흐름 방해 없이 카드 우측 상단에 절대 배치 */}
                            {featuredHasSummary && (
                                <button
                                    onClick={(e) => toggleSummary(featured.id, e.currentTarget)}
                                    aria-label="AI 3줄요약 보기"
                                    title="AI 3줄요약"
                                    className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/15 transition-colors"
                                >
                                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                                </button>
                            )}

                            <div className="flex flex-col">
                                    {/* 투표 질문 */}
                                    <h3 className={`text-[17px] font-bold text-content-primary leading-snug mb-4 ${featuredHasSummary ? 'pr-8' : ''}`}>
                                        {decodeHtml(featured.title ?? '이 이슈에 대해 어떻게 생각하시나요?')}
                                    </h3>

                                    {/* 결과지 */}
                                    {featuredShowResults && (
                                        <div className="flex flex-col gap-4">
                                            {featuredSortedByCount.map((choice, i) => {
                                                const ratio = featuredTotal > 0 ? Math.round((choice.count / featuredTotal) * 100) : 0
                                                const isMyChoice = choice.id === featuredUserChoiceId
                                                return (
                                                    <div key={choice.id}>
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                                <span className="text-[11px] leading-none text-content-muted shrink-0 w-3">{i + 1}</span>
                                                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                                                    {isMyChoice && (
                                                                        <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
                                                                    )}
                                                                    <p className={`text-sm leading-none line-clamp-1 ${isMyChoice ? 'font-semibold text-primary' : 'text-content-secondary'}`}>
                                                                        {choice.label}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className={`text-sm font-bold ml-2 shrink-0 ${isMyChoice ? 'text-primary' : 'text-content-secondary'}`}>
                                                                {ratio}%
                                                            </span>
                                                        </div>
                                                        <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${isMyChoice ? 'bg-primary' : 'bg-border-strong'}`}
                                                                style={{ width: `${ratio}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* 투표 전: 선택지 + 버튼 */}
                                    {!featuredShowResults && (
                                        <div className="flex flex-col gap-2">
                                            {choices.map((choice) => {
                                                const isSelected = featuredSelectedChoiceId === choice.id
                                                return (
                                                    <button
                                                        key={choice.id}
                                                        onClick={() => setSelectedChoices(prev => ({ ...prev, [featured.id]: choice.id }))}
                                                        className={`w-full text-left px-3 py-1.5 rounded-lg border transition-all ${
                                                            isSelected
                                                                ? 'border-primary bg-primary/5'
                                                                : 'border-border hover:border-primary/40'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                                                isSelected ? 'bg-primary border-0' : 'border-2 border-border-strong'
                                                            }`}>
                                                                {isSelected && (
                                                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                                                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                                                    </svg>
                                                                )}
                                                            </span>
                                                            <span className={`text-sm line-clamp-1 ${isSelected ? 'font-semibold text-primary' : 'text-content-primary'}`}>
                                                                {choice.label}
                                                            </span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}

                            </div>

                            {/* 푸터 액션 */}
                            <div className="mt-5">
                                {featuredShowResults ? (
                                    <Link
                                        href={`/issue/${featuredIssueId}#section-vote`}
                                        className="flex items-center justify-center w-full h-10 text-sm font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                                    >
                                        자세히 보기
                                    </Link>
                                ) : (
                                    <button
                                        onClick={() => featuredSelectedChoiceId && submitVote(featured.id, featuredSelectedChoiceId)}
                                        disabled={!featuredSelectedChoiceId || featuredSubmitting}
                                        className={`w-full h-10 rounded-lg text-sm font-bold transition-all ${
                                            featuredSelectedChoiceId
                                                ? 'bg-primary text-white hover:opacity-90 active:scale-[0.98]'
                                                : 'bg-surface-muted text-content-muted cursor-not-allowed'
                                        }`}
                                    >
                                        {featuredSubmitting
                                            ? '투표 중...'
                                            : !userId && featuredSelectedChoiceId
                                                ? '로그인하고 결과보기'
                                                : '투표하기'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 우측: 다른 투표 목록 — 3개씩 슬라이드로 최대 6개 노출, 페이지네이션 도트로 이동 */}
                {others.length > 0 && (
                    <div className="min-w-0">
                        <div className="overflow-hidden -m-4 p-4">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={otherPage}
                                    initial={{ x: otherDirection > 0 ? 48 : -48, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: otherDirection > 0 ? -48 : 48, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.12}
                                    onDragStart={() => { isDraggingRef.current = true }}
                                    onDragEnd={(_e, info) => {
                                        if (info.offset.x < -60 || info.velocity.x < -400) goOtherNext()
                                        else if (info.offset.x > 60 || info.velocity.x > 400) goOtherPrev()
                                        setTimeout(() => { isDraggingRef.current = false }, 50)
                                    }}
                                    onClickCapture={(e) => {
                                        if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation() }
                                    }}
                                    className="grid grid-cols-1 sm:grid-cols-3 gap-4 cursor-grab active:cursor-grabbing"
                                >
                                    {visibleOthers.map((vote) => (
                                        <OtherVoteCard
                                            key={vote.id}
                                            vote={vote}
                                            onToggleSummary={toggleSummary}
                                        />
                                    ))}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {otherTotalPages > 1 && (
                            <div className="flex items-center justify-center gap-1.5 mt-4">
                                {Array.from({ length: otherTotalPages }).map((_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => { setOtherDirection(i > otherPage ? 1 : -1); setOtherPage(i) }}
                                        aria-label={`${i + 1}페이지`}
                                        className={`rounded-full transition-all ${
                                            i === otherPage ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-border-strong'
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* AI 3줄요약 팝오버 — 버튼 위치에 앵커링, 배경 딤 없이 바깥 클릭/스크롤 시 닫힘 */}
            {isSummaryOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={summaryPopoverRef}
                    className="fixed z-50 w-[288px] max-w-[calc(100vw-1rem)] rounded-xl bg-surface border border-border shadow-card-hover animate-fade-in-slide"
                    style={{
                        left: summaryPopover.left,
                        top: summaryPopover.top,
                        bottom: summaryPopover.bottom,
                    }}
                >
                    <div className="relative p-4">
                        <button
                            onClick={() => setSummaryPopover(null)}
                            aria-label="닫기"
                            className="absolute top-3 right-3 text-content-muted hover:text-content-primary transition-colors"
                        >
                            <X className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                        <p className="text-sm font-bold text-content-primary mb-2 pr-6 line-clamp-2">
                            {summaryVote?.issues?.title}
                        </p>
                        <ol className="flex flex-col gap-2">
                            {summaryVoteThreeLine.map((line, i) => (
                                <li key={i} className="text-[13px] text-content-secondary leading-relaxed">
                                    <span className="text-primary font-bold">{i + 1}.</span> {line}
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>,
                document.body
            )}
        </section>
    )
}

// 우측 "다른 투표" 카드 — 이미지 + 제목 + 참여 수/카테고리/시간
function OtherVoteCard({ vote, onToggleSummary }: { vote: VoteWithChoices; onToggleSummary: (voteId: string, btn: HTMLElement) => void }) {
    const issue = vote.issues
    if (!issue) return null

    const thumbUrl = issue.thumbnail_urls?.[issue.primary_thumbnail_index ?? 0]
    const totalCount = totalVoteCount(vote)
    const winner = topChoice(vote)
    const ratio = winner && totalCount > 0 ? Math.round((winner.count / totalCount) * 100) : 0
    const hasSummary = (issue.brief_summary?.threeLine ?? []).length > 0

    return (
        <div className="relative card-hover overflow-visible group">
            <Link href={`/issue/${issue.id}#section-vote`} draggable={false} onDragStart={(e) => e.preventDefault()} className="block">
                <div className={`relative aspect-[16/9] rounded-t-xl overflow-hidden ${thumbUrl ? '' : 'bg-surface-muted'}`}>
                    {thumbUrl && (
                        <Image
                            src={thumbUrl}
                            alt=""
                            fill
                            draggable={false}
                            className="object-cover"
                            sizes="(min-width: 1024px) 200px, 33vw"
                        />
                    )}
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md border border-white/40 text-white text-[10.5px] font-semibold">
                        <Eye className="w-3 h-3 shrink-0" strokeWidth={2} />
                        현재 {estimateViewers(vote.id)}명이 보고 있어요
                    </span>
                </div>
                <div className="p-3.5 min-h-[105px] flex flex-col justify-between">
                    <p className="text-[15.5px] font-bold text-content-primary leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {decodeHtml(vote.title ?? issue.title)}
                    </p>
                    <div>
                        {totalCount >= 3 && winner && (
                            <div className="text-xs font-bold text-primary mb-1">
                                {winner.label} · {ratio}%
                            </div>
                        )}
                        {totalCount === 2 && winner && (
                            <div className="text-xs font-bold text-content-secondary mb-1">
                                <span className="text-primary">{winner.label}</span>가 가장 많았어요
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-1 text-xs text-content-muted">
                            <div className="flex items-center gap-1 min-w-0">
                                {issue.category && (
                                    <span className="text-content-secondary font-medium">{issue.category}</span>
                                )}
                                <span>·</span>
                                <time dateTime={vote.created_at}>{formatDate(vote.created_at)}</time>
                            </div>
                            {totalCount > 0 ? (
                                <span className="shrink-0 text-content-primary">
                                    <span className="text-primary font-bold">{totalCount.toLocaleString()}</span>명 참여
                                </span>
                            ) : (
                                <span className="shrink-0 font-bold text-primary">첫 투표 남기기 →</span>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
            {hasSummary && (
                <button
                    type="button"
                    onClick={(e) => onToggleSummary(vote.id, e.currentTarget)}
                    aria-label="AI 3줄요약 보기"
                    title="AI 3줄요약"
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-black/25 border border-white/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/35 transition-colors"
                >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
            )}
        </div>
    )
}
