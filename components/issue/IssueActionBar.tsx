'use client'

/**
 * components/issue/IssueActionBar.tsx
 *
 * 이슈 상세 페이지의 상시 액션 바.
 * - xl(1280px) 이상: 뷰포트 좌측 여백에 뜨는 세로 레일 (position: fixed, 스크롤 내내 유지)
 *   콘텐츠 블록 좌측 끝에서 40px 떨어진 위치에 고정 배치되므로 브레이크포인트와 무관하게 여백이 일정함.
 * - xl 미만: 화면 하단에 뜨는 가로 캡슐 바 (모바일 포함 전체)
 * 순서: 감정반응 → 투표 → 토론 → 댓글 → 북마크 → 공유
 * (이전 IssueScrollHeader + IssueStatBar를 대체)
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { MessageSquare, ChartColumn, Users, Bookmark } from 'lucide-react'
import ReactionDropdown from '@/components/issue/ReactionDropdown'
import ShareButton from '@/components/issue/ShareButton'
import LoginPromptModal from '@/components/common/LoginPromptModal'
import { goToLoginWithPendingAction } from '@/lib/pendingAction'
import { usePendingAction } from '@/hooks/usePendingAction'

interface Props {
    issueId: string
    userId: string | null
    initialVoteCount: number
    initialDiscussionCount: number
    shortCode?: string
    title: string
    thumbnailUrl?: string
}

interface Stats {
    commentCount: number
    voteCount: number
    discussionCount: number
}

/* 북마크 기능 임시 비활성화 - 기능 마무리되면 true로 되돌려서 다시 노출 */
const BOOKMARK_ENABLED = false

const NAV_ITEMS = [
    { key: 'voteCount' as keyof Stats,       icon: <ChartColumn className="w-5 h-5" strokeWidth={1.8} />,    scrollTo: 'section-vote',       label: '투표', indicator: 'dot' as const },
    { key: 'discussionCount' as keyof Stats, icon: <Users className="w-5 h-5" strokeWidth={1.8} />,          scrollTo: 'section-discussion', label: '토론', indicator: 'dot' as const },
    { key: 'commentCount' as keyof Stats,    icon: <MessageSquare className="w-5 h-5" strokeWidth={1.8} />,  scrollTo: 'section-comments',   label: '댓글', indicator: 'count' as const },
]

/* 투표/토론=존재 여부만(주황 점), 댓글=실제 개수(빨간 배지). 0이면 아이콘 자체를 흐리게. */
function NavIcon({ icon, count, indicator }: { icon: ReactNode; count: number; indicator: 'dot' | 'count' }) {
    const active = count > 0
    return (
        <span className={`relative inline-flex ${active ? 'text-content-secondary' : 'text-content-muted'}`}>
            {icon}
            {active && indicator === 'dot' && (
                <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-orange-400" />
            )}
            {active && indicator === 'count' && (
                <span className="absolute -top-2 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-white text-[11px] font-extrabold flex items-center justify-center leading-none tabular-nums">
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </span>
    )
}

function handleNavClick(scrollTo: string) {
    const el = document.getElementById(scrollTo)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl', 'transition-all')
        setTimeout(() => {
            el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl', 'transition-all')
        }, 700)
    }, 400)
}

export default function IssueActionBar({ issueId, userId, initialVoteCount, initialDiscussionCount, shortCode, title, thumbnailUrl }: Props) {
    const [stats, setStats] = useState<Stats>({
        commentCount: 0,
        voteCount: initialVoteCount,
        discussionCount: initialDiscussionCount,
    })
    const [bookmarked, setBookmarked] = useState(false)
    const [bookmarkCount, setBookmarkCount] = useState(0)
    const [bookmarkSubmitting, setBookmarkSubmitting] = useState(false)
    const [loginPromptOpen, setLoginPromptOpen] = useState(false)

    useEffect(() => {
        fetch(`/api/issues/${issueId}/stats`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data) setStats({ commentCount: data.commentCount, voteCount: data.voteCount, discussionCount: data.discussionCount }) })
            .catch(() => {})
    }, [issueId])

    const loadBookmark = useCallback(() => {
        fetch(`/api/issues/${issueId}/bookmark`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data) {
                    setBookmarked(!!data.bookmarked)
                    setBookmarkCount(data.count ?? 0)
                }
            })
            .catch(() => {})
    }, [issueId])

    useEffect(() => { loadBookmark() }, [loadBookmark])

    const submitBookmark = useCallback(async () => {
        if (bookmarkSubmitting) return

        const prevBookmarked = bookmarked
        const prevCount = bookmarkCount
        setBookmarked(!prevBookmarked)
        setBookmarkCount(prevBookmarked ? Math.max(0, prevCount - 1) : prevCount + 1)
        setBookmarkSubmitting(true)

        try {
            const res = await fetch(`/api/issues/${issueId}/bookmark`, { method: 'POST' })
            if (!res.ok) {
                setBookmarked(prevBookmarked)
                setBookmarkCount(prevCount)
            }
        } catch {
            setBookmarked(prevBookmarked)
            setBookmarkCount(prevCount)
        } finally {
            setBookmarkSubmitting(false)
        }
    }, [issueId, bookmarked, bookmarkCount, bookmarkSubmitting])

    usePendingAction(
        'bookmark',
        (action) => action.issueId === issueId,
        () => submitBookmark(),
        !!userId
    )

    const handleBookmarkClick = () => {
        if (!userId) {
            setLoginPromptOpen(true)
            return
        }
        submitBookmark()
    }

    /* size: 레일(PC, 마우스)=36px, 캡슐(모바일, 터치)=44px - iOS/Android 권장 최소 터치 영역 */
    const navButtonClass = (size: string, extra: string) =>
        `flex items-center justify-center ${size} rounded-full text-content-secondary hover:text-content-primary transition-colors ${extra}`

    return (
        <>
            {/* 데스크톱: xl(1280px) 이상, 뷰포트 좌측 여백의 세로 레일 (position: fixed) */}
            <div
                className="hidden xl:flex flex-col items-center gap-2 fixed top-1/2 -translate-y-1/2 z-10 bg-surface border border-border rounded-full shadow-md py-3 px-2"
                style={{ left: 'calc(50% - 580px)' }}
            >
                <ReactionDropdown issueId={issueId} userId={userId} layout="block" panelDirection="right" />

                {NAV_ITEMS.map(({ key, icon, scrollTo, label, indicator }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleNavClick(scrollTo)}
                        aria-label={label}
                        className={navButtonClass('w-9 h-9', 'hover:bg-surface-subtle')}
                    >
                        <NavIcon icon={icon} count={stats[key]} indicator={indicator} />
                    </button>
                ))}

                <div className="w-8 h-px bg-border my-1" />

                {BOOKMARK_ENABLED && (
                    <button
                        type="button"
                        onClick={handleBookmarkClick}
                        disabled={bookmarkSubmitting}
                        aria-label="북마크"
                        className={navButtonClass('w-9 h-9', `relative hover:bg-surface-subtle ${bookmarked ? 'text-primary' : ''} ${bookmarkSubmitting ? 'opacity-60' : ''}`)}
                    >
                        <Bookmark className="w-5 h-5" strokeWidth={1.8} fill={bookmarked ? 'currentColor' : 'none'} />
                        {bookmarkCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-white text-[11px] font-extrabold flex items-center justify-center leading-none tabular-nums">
                                {bookmarkCount > 99 ? '99+' : bookmarkCount}
                            </span>
                        )}
                    </button>
                )}

                {shortCode && (
                    <ShareButton issueId={issueId} shortCode={shortCode} title={title} thumbnailUrl={thumbnailUrl} compact panelDirection="right" />
                )}
            </div>

            {/* 모바일 ~ xl 미만: 화면 하단 캡슐 바 */}
            <div className="flex xl:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-20 items-center gap-2 bg-surface border border-border rounded-full shadow-lg px-2 py-1.5">
                <ReactionDropdown issueId={issueId} userId={userId} panelDirection="up" />

                {NAV_ITEMS.map(({ key, icon, scrollTo, label, indicator }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleNavClick(scrollTo)}
                        aria-label={label}
                        className={navButtonClass('w-11 h-11', 'hover:bg-surface-subtle')}
                    >
                        <NavIcon icon={icon} count={stats[key]} indicator={indicator} />
                    </button>
                ))}

                {BOOKMARK_ENABLED && (
                    <button
                        type="button"
                        onClick={handleBookmarkClick}
                        disabled={bookmarkSubmitting}
                        aria-label="북마크"
                        className={navButtonClass('w-11 h-11', `relative hover:bg-surface-subtle ${bookmarked ? 'text-primary' : ''} ${bookmarkSubmitting ? 'opacity-60' : ''}`)}
                    >
                        <Bookmark className="w-5 h-5" strokeWidth={1.8} fill={bookmarked ? 'currentColor' : 'none'} />
                        {bookmarkCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-white text-[11px] font-extrabold flex items-center justify-center leading-none tabular-nums">
                                {bookmarkCount > 99 ? '99+' : bookmarkCount}
                            </span>
                        )}
                    </button>
                )}

                {shortCode && (
                    <ShareButton issueId={issueId} shortCode={shortCode} title={title} thumbnailUrl={thumbnailUrl} compact panelDirection="up" />
                )}
            </div>

            <LoginPromptModal
                isOpen={loginPromptOpen}
                description="북마크하려면 로그인이 필요해요."
                onClose={() => setLoginPromptOpen(false)}
                onConfirm={() => {
                    setLoginPromptOpen(false)
                    goToLoginWithPendingAction({ type: 'bookmark', issueId })
                }}
            />
        </>
    )
}
