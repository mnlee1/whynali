'use client'

/**
 * components/common/VoteReminderBanner.tsx
 *
 * [하단 고정형 투표 리마인드 배너]
 *
 * 종료까지 NEAR_DEADLINE_DAYS일 이하로 남은 투표가 있을 때만 하단 우측에 플로팅
 * 카드로 노출해 "얼마 안 남았다"는 긴급성으로 참여를 유도한다. 해당하는 투표가
 * 없으면(전부 여유 있거나 종료일 미설정) 아예 노출하지 않는다. 이미 투표한 항목은
 * 후보에서 제외한다. 닫기(X)는 투표 id별로 localStorage에 시각을 기록해 24시간 동안
 * 다시 노출하지 않는다 — 그 이후엔 같은 투표라도 다시 뜬다(D-3에 닫아도 D-1엔 재노출돼
 * 마감 임박 긴급성을 계속 전달). 배너가 가리키는 투표의 이슈 상세 페이지에 이미 들어와
 * 있으면(투표 카드가 화면에 보이는 상태이므로) 중복 노출을 막기 위해 숨긴다.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'

const DISMISS_STORAGE_KEY = 'whynali:voteReminderDismissed'
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000

function isRecentlyDismissed(voteId: string): boolean {
    try {
        const raw = localStorage.getItem(DISMISS_STORAGE_KEY)
        if (!raw) return false
        const map = JSON.parse(raw) as Record<string, number>
        const dismissedAt = map[voteId]
        return typeof dismissedAt === 'number' && Date.now() - dismissedAt < DISMISS_TTL_MS
    } catch {
        return false
    }
}

function markDismissed(voteId: string) {
    try {
        const raw = localStorage.getItem(DISMISS_STORAGE_KEY)
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
        map[voteId] = Date.now()
        localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map))
    } catch {
        // localStorage 접근 불가 환경(프라이빗 모드 등)에서는 건너뛴다
    }
}

interface VoteChoice {
    id: string
    count: number
}

interface FeaturedVote {
    id: string
    title: string | null
    auto_end_date: string | null
    vote_choices: VoteChoice[]
    issues: { id: string } | null
}

// 이 값 이하로 남았을 때만 "종료 임박"으로 보고 배너를 노출한다.
const NEAR_DEADLINE_DAYS = 3

// 캘린더 날짜 기준 D-day: 시각과 무관하게 "오늘 마감"이면 0을 반환한다.
function getDday(autoEndDate: string | null): number | null {
    if (!autoEndDate) return null
    const end = new Date(autoEndDate)
    const now = new Date()
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 ? diffDays : null
}

function formatDday(days: number): string {
    return days === 0 ? 'D-day' : `D-${days}`
}

export default function VoteReminderBanner() {
    const pathname = usePathname()
    const [vote, setVote] = useState<FeaturedVote | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (pathname.startsWith('/admin')) return

        fetch('/api/votes?limit=50')
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (!json) return
                const userVotes: Record<string, string> = json.userVotes ?? {}
                const candidates: FeaturedVote[] = (json.data ?? []).filter(
                    (v: { phase: string; issues: { id: string } | null; id: string; auto_end_date: string | null }) => {
                        if (v.phase !== '진행중' || !v.issues?.id || userVotes[v.id]) return false
                        const dday = getDday(v.auto_end_date)
                        return dday !== null && dday <= NEAR_DEADLINE_DAYS
                    }
                )
                if (candidates.length === 0) return

                // 종료 임박한 순(D-day 작은 순)으로 가장 급한 투표를 노출
                candidates.sort((a, b) => getDday(a.auto_end_date)! - getDday(b.auto_end_date)!)

                setVote(candidates[0])
            })
            .catch(() => {
                // 실패 시 배너 미노출
            })
    }, [])

    useEffect(() => {
        if (!vote) return
        if (isRecentlyDismissed(vote.id)) return
        const timer = setTimeout(() => setVisible(true), 1500)
        return () => clearTimeout(timer)
    }, [vote])

    if (!vote || !visible) return null
    if (pathname.startsWith('/admin')) return null
    if (vote.issues && pathname === `/issue/${vote.issues.id}`) return null

    const totalCount = vote.vote_choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
    const dday = getDday(vote.auto_end_date)

    const dismiss = () => {
        markDismissed(vote.id)
        setVisible(false)
    }

    return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 md:bottom-24 md:right-8 z-40 w-[calc(100%-2rem)] max-w-[320px]">
            <div className="relative bg-white border border-border rounded-xl shadow-card-hover p-6 text-center animate-fade-in-slide">
                <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-xs font-bold text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        투표 종료까지 {formatDday(dday ?? 0)}
                    </span>
                    <button
                        onClick={dismiss}
                        aria-label="닫기"
                        className="text-content-muted hover:text-content-primary transition-colors"
                    >
                        <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>

                <p className="mt-5 text-base font-bold text-content-primary leading-snug line-clamp-2">
                    🔥 {vote.title ?? '지금 이 이슈, 어떻게 생각해?'}
                </p>

                <Link
                    href={`/issue/${vote.issues!.id}#section-vote`}
                    className="btn-md btn-primary mt-5 w-full rounded-lg font-bold"
                >
                    투표하기
                </Link>

                {totalCount > 0 && (
                    <p className="mt-3 text-xs text-content-secondary">
                        투표 <span className="font-bold text-primary">{totalCount.toLocaleString()}</span>명 참여 중!
                    </p>
                )}
            </div>
        </div>
    )
}
