'use client'

/**
 * app/mypage/MypageClient.tsx
 *
 * 마이페이지 클라이언트 컴포넌트
 * - 탭: 프로필 | 내 댓글 | 내 토론 | 내 투표
 * - 프로필: 닉네임 변경, 마케팅 동의 토글, 로그아웃, 회원 탈퇴
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

type IssueRef = { id: string; title: string }

type CommentRow = {
    id: string
    body: string
    created_at: string
    like_count: number
    issues: IssueRef | null
}

type DiscussionRow = {
    id: string
    body: string
    created_at: string
    like_count: number
    discussion_topics: {
        id: string
        body: string
        issues: IssueRef | null
    } | null
}

type VoteRow = {
    id: string
    created_at: string
    vote_choices: { label: string } | null
    votes: {
        id: string
        title: string | null
        phase: string
        issues: IssueRef | null
    } | null
}

interface MypageClientProps {
    userId: string
    provider: string
    email: string | null
    displayName: string
    joinedAt: string
    marketingAgreed: boolean
    isAdmin?: boolean
    comments: CommentRow[]
    discussions: DiscussionRow[]
    votes: VoteRow[]
}

const PROVIDER_LABEL: Record<string, { text: string; badge: string; badgeClass: string }> = {
    '구글': { text: '구글', badge: 'G', badgeClass: 'bg-white border border-gray-300 text-blue-600' },
    '카카오': { text: '카카오', badge: 'K', badgeClass: 'bg-yellow-300 text-gray-900' },
    '네이버': { text: '네이버', badge: 'N', badgeClass: 'bg-green-500 text-white' },
}

type Tab = 'profile' | 'comments' | 'discussions' | 'votes'

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
    })
}

export default function MypageClient({
    userId,
    provider,
    email,
    displayName,
    joinedAt,
    marketingAgreed: initialMarketing,
    isAdmin = false,
    comments,
    discussions,
    votes,
}: MypageClientProps) {
    const [tab, setTab] = useState<Tab>('profile')

    // 닉네임 변경
    const [nickname, setNickname] = useState(displayName)
    const [nicknameInput, setNicknameInput] = useState(displayName)
    const [nicknameError, setNicknameError] = useState<string | null>(null)
    const [nicknameSuccess, setNicknameSuccess] = useState(false)
    const [isSavingNickname, setIsSavingNickname] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)
    const [isDuplicate, setIsDuplicate] = useState<boolean | null>(null)

    const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/
    const nicknameInputValid = nicknameInput.length >= 2 && nicknameInput.length <= 16 && NICKNAME_REGEX.test(nicknameInput)

    useEffect(() => {
        // 현재 저장된 닉네임과 동일하면 중복 체크 불필요
        if (nicknameInput === nickname || !nicknameInputValid) {
            setIsDuplicate(null)
            setIsCheckingDuplicate(false)
            return
        }
        setIsCheckingDuplicate(true)
        setIsDuplicate(null)
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/users/nickname/check?nickname=${encodeURIComponent(nicknameInput)}`)
                const data = await res.json()
                setIsDuplicate(!data.available)
            } catch {
                setIsDuplicate(null)
            } finally {
                setIsCheckingDuplicate(false)
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [nicknameInput, nickname, nicknameInputValid])

    // 마케팅 동의
    const [marketing, setMarketing] = useState(initialMarketing)
    const [isSavingMarketing, setIsSavingMarketing] = useState(false)
    const [marketingError, setMarketingError] = useState<string | null>(null)

    // 탈퇴 모달
    const [showWithdrawModal, setShowWithdrawModal] = useState(false)
    const [withdrawConfirm, setWithdrawConfirm] = useState('')
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [withdrawError, setWithdrawError] = useState<string | null>(null)

    const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const providerInfo = isAdmin
        ? { text: '관리자', badge: '운', badgeClass: 'bg-red-500 text-white' }
        : PROVIDER_LABEL[provider] ?? { text: provider, badge: '?', badgeClass: 'bg-gray-200 text-gray-600' }
    const initial = nickname.charAt(0).toUpperCase()

    const handleGenerateNickname = async () => {
        setIsGenerating(true)
        setNicknameError(null)
        setNicknameSuccess(false)
        try {
            const res = await fetch('/api/onboarding/nickname')
            const data = await res.json()
            if (data.nickname) setNicknameInput(data.nickname)
        } catch {
            // 실패 시 무시
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSaveNickname = async () => {
        if (nicknameInput === nickname) return
        setNicknameError(null)
        setNicknameSuccess(false)
        setIsSavingNickname(true)
        try {
            const res = await fetch('/api/users/nickname', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: nicknameInput }),
            })
            const data = await res.json()
            if (!res.ok) {
                setNicknameError(data.error ?? '닉네임 변경에 실패했습니다.')
            } else {
                setNickname(nicknameInput)
                setNicknameSuccess(true)
            }
        } catch {
            setNicknameError('서버 오류가 발생했습니다.')
        } finally {
            setIsSavingNickname(false)
        }
    }

    const handleToggleMarketing = async () => {
        setIsSavingMarketing(true)
        setMarketingError(null)
        const next = !marketing
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ marketingAgreed: next }),
            })
            if (res.ok) {
                setMarketing(next)
            } else {
                setMarketingError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
            }
        } catch {
            setMarketingError('서버 오류가 발생했습니다.')
        } finally {
            setIsSavingMarketing(false)
        }
    }

    const handleLogout = async () => {
        await sb.auth.signOut()
        window.location.replace('/')
    }

    const handleWithdraw = async () => {
        if (withdrawConfirm !== '탈퇴합니다') return
        setIsWithdrawing(true)
        setWithdrawError(null)
        try {
            const res = await fetch('/api/users/me', { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json()
                setWithdrawError(data.error ?? '탈퇴 처리에 실패했습니다.')
                setIsWithdrawing(false)
                return
            }
            await sb.auth.signOut()
            window.location.replace('/')
        } catch {
            setWithdrawError('서버 오류가 발생했습니다.')
            setIsWithdrawing(false)
        }
    }

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'profile', label: '프로필' },
        { key: 'comments', label: '댓글', count: comments.length },
        { key: 'discussions', label: '토론', count: discussions.length },
        { key: 'votes', label: '투표', count: votes.length },
    ]

    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            {/* 프로필 카드 */}
            <div className="flex items-center gap-4 mb-8 p-5 bg-primary-light/35 border border-primary-muted rounded-xl">
                <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-surface shadow-sm flex items-center justify-center text-2xl font-bold text-primary border border-primary-muted">
                        {initial}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${providerInfo.badgeClass}`}>
                        {providerInfo.badge}
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-lg font-bold text-content-primary">{nickname}</p>
                    <p className="text-sm text-content-secondary mt-0.5 truncate">{email ?? providerInfo.text}</p>
                    <p className="text-xs text-content-muted mt-1">가입일 {formatDate(joinedAt)}</p>
                </div>
            </div>

            {/* 탭 */}
            <div className="flex flex-wrap gap-1.5 mb-6">
                {tabs.map(({ key, label, count }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={[
                            'flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap',
                            tab === key
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                        ].join(' ')}
                    >
                        {label}
                        {count !== undefined && count > 0 && (
                            <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${tab === key ? 'bg-white/25 text-white' : 'bg-primary-light text-primary'}`}>
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* 프로필 탭 */}
            {tab === 'profile' && (
                <div className="space-y-6">
                    {/* 닉네임 변경 */}
                    <section className="card p-5">
                        <h2 className="text-sm font-semibold text-content-secondary mb-3">닉네임 변경</h2>
                        {isAdmin ? (
                            <div>
                                <input
                                    type="text"
                                    value={nicknameInput}
                                    disabled
                                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface-subtle text-content-disabled cursor-not-allowed"
                                />
                                <p className="mt-2 text-xs text-content-muted">관리자 계정은 닉네임을 변경할 수 없습니다.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={nicknameInput}
                                        onChange={(e) => {
                                            setNicknameInput(e.target.value)
                                            setNicknameError(null)
                                            setNicknameSuccess(false)
                                            setIsDuplicate(null)
                                        }}
                                        maxLength={16}
                                        className="flex-1 px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                        placeholder="닉네임 입력"
                                    />
                                    <button
                                        onClick={handleGenerateNickname}
                                        disabled={isGenerating}
                                        className="btn-neutral btn-sm whitespace-nowrap"
                                    >
                                        {isGenerating ? '생성 중...' : '랜덤 생성'}
                                    </button>
                                    <button
                                        onClick={handleSaveNickname}
                                        disabled={isSavingNickname || nicknameInput === nickname || !nicknameInputValid || isDuplicate === true || isCheckingDuplicate}
                                        className="btn-primary btn-sm"
                                    >
                                        {isSavingNickname ? '저장 중...' : '저장'}
                                    </button>
                                </div>
                                <p className="text-xs text-content-muted">한글·영문·숫자·_ 사용 가능, 2~16자</p>
                                {nicknameError && <p className="mt-1.5 text-xs text-red-600">{nicknameError}</p>}
                                {nicknameSuccess && <p className="mt-1.5 text-xs text-green-600">닉네임이 변경되었습니다.</p>}
                                {!nicknameError && !nicknameSuccess && nicknameInput !== nickname && nicknameInputValid && (
                                    isCheckingDuplicate ? (
                                        <p className="mt-1.5 text-xs text-content-muted">중복 확인 중...</p>
                                    ) : isDuplicate === true ? (
                                        <p className="mt-1.5 text-xs text-red-600">이미 사용 중인 닉네임입니다.</p>
                                    ) : isDuplicate === false ? (
                                        <p className="mt-1.5 text-xs text-green-600">사용 가능한 닉네임입니다.</p>
                                    ) : null
                                )}
                            </>
                        )}
                    </section>

                    {/* 마케팅 수신 동의 */}
                    <section className="card p-5">
                        <h2 className="text-sm font-semibold text-content-secondary mb-3">마케팅 수신 동의</h2>
                        <label className="flex items-center justify-between cursor-pointer">
                            <div>
                                <span className="text-sm text-content-secondary">서비스 업데이트·이벤트 알림 수신</span>
                                <p className="text-xs text-content-muted mt-0.5">
                                    가입 시 등록한 이메일로 발송됩니다.
                                </p>
                            </div>
                            <button
                                onClick={handleToggleMarketing}
                                disabled={isSavingMarketing}
                                className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ml-4 ${
                                    marketing ? 'bg-primary' : 'bg-content-disabled'
                                } disabled:opacity-50`}
                                aria-label="마케팅 수신 동의 토글"
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                                        marketing ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </label>
                        {marketingError && (
                            <p className="mt-2 text-xs text-red-600">{marketingError}</p>
                        )}
                    </section>

                    {/* 계정 관리 */}
                    <section className="card p-5">
                        <h2 className="text-sm font-semibold text-content-secondary mb-3">계정 관리</h2>
                        <button
                            onClick={handleLogout}
                            className="btn-neutral btn-md w-full"
                        >
                            로그아웃
                        </button>
                        <div className="mt-4 text-center">
                            <button
                                onClick={() => setShowWithdrawModal(true)}
                                className="text-xs text-red-400 hover:text-red-600 underline underline-offset-2 transition-colors"
                            >
                                회원 탈퇴
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {/* 내 댓글 탭 */}
            {tab === 'comments' && (
                <div className="space-y-3">
                    {comments.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">작성한 댓글이 없습니다.</p>
                    ) : (
                        comments.map((c) => (
                            <div key={c.id} className="card-hover p-4">
                                {c.issues && (
                                    <Link
                                        href={`/issue/${c.issues.id}`}
                                        className="text-xs font-medium text-primary hover:underline mb-1.5 block truncate"
                                    >
                                        {c.issues.title}
                                    </Link>
                                )}
                                <p className="text-sm text-content-primary line-clamp-2">{c.body}</p>
                                <p className="text-xs text-content-muted mt-1.5">{formatDate(c.created_at)}</p>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 내 토론 탭 */}
            {tab === 'discussions' && (
                <div className="space-y-3">
                    {discussions.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">참여한 토론이 없습니다.</p>
                    ) : (
                        discussions.map((d) => (
                            <div key={d.id} className="card-hover p-4">
                                {d.discussion_topics?.issues && (
                                    <Link
                                        href={`/issue/${d.discussion_topics.issues.id}`}
                                        className="text-xs font-medium text-primary hover:underline mb-1 block truncate"
                                    >
                                        {d.discussion_topics.issues.title}
                                    </Link>
                                )}
                                {d.discussion_topics && (
                                    <p className="text-xs text-content-secondary mb-1.5 line-clamp-1">
                                        토론 주제: {d.discussion_topics.body}
                                    </p>
                                )}
                                <p className="text-sm text-content-primary line-clamp-2">{d.body}</p>
                                <p className="text-xs text-content-muted mt-1.5">{formatDate(d.created_at)}</p>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 내 투표 탭 */}
            {tab === 'votes' && (
                <div className="space-y-3">
                    {votes.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">참여한 투표가 없습니다.</p>
                    ) : (
                        votes.map((v) => (
                            <div key={v.id} className="card-hover p-4">
                                {v.votes?.issues && (
                                    <Link
                                        href={`/issue/${v.votes.issues.id}`}
                                        className="text-xs font-medium text-primary hover:underline mb-1 block truncate"
                                    >
                                        {v.votes.issues.title}
                                    </Link>
                                )}
                                {v.votes?.title && (
                                    <p className="text-sm font-medium text-content-primary mb-1">{v.votes.title}</p>
                                )}
                                <div className="flex items-center gap-2">
                                    {v.vote_choices && (
                                        <span className="text-xs px-2 py-0.5 bg-primary-light text-primary rounded-full font-medium">
                                            {v.vote_choices.label} 선택
                                        </span>
                                    )}
                                    {v.votes?.phase && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                            v.votes.phase === '진행중'
                                                ? 'bg-green-50 text-green-700'
                                                : 'bg-surface-subtle text-content-muted'
                                        }`}>
                                            {v.votes.phase}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-content-muted mt-1.5">{formatDate(v.created_at)}</p>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 탈퇴 확인 모달 */}
            {showWithdrawModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
                    <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-content-primary mb-2">정말 탈퇴하시겠습니까?</h3>
                        <p className="text-sm text-content-secondary mb-4">
                            탈퇴 시 모든 댓글, 반응, 투표 기록이 삭제되며 복구할 수 없습니다.
                            <br />
                            확인하려면 아래에 <strong>탈퇴합니다</strong>를 입력하세요.
                        </p>
                        <input
                            type="text"
                            value={withdrawConfirm}
                            onChange={(e) => {
                                setWithdrawConfirm(e.target.value)
                                setWithdrawError(null)
                            }}
                            placeholder="탈퇴합니다"
                            className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
                        />
                        {withdrawError && <p className="text-xs text-red-600 mb-3">{withdrawError}</p>}
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowWithdrawModal(false)
                                    setWithdrawConfirm('')
                                    setWithdrawError(null)
                                }}
                                className="btn-neutral btn-md flex-1"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleWithdraw}
                                disabled={withdrawConfirm !== '탈퇴합니다' || isWithdrawing}
                                className="btn-danger btn-md flex-1"
                            >
                                {isWithdrawing ? '처리 중...' : '탈퇴하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
