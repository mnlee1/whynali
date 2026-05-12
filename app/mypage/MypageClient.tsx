'use client'

/**
 * app/mypage/MypageClient.tsx
 *
 * 마이페이지 클라이언트 컴포넌트
 * - 탭: 프로필 | 내 댓글 | 내 토론 | 내 투표
 * - 프로필: 닉네임 변경, 마케팅 동의 토글, 로그아웃, 회원 탈퇴
 */

import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { validateEmail } from '@/lib/validate-email'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

type IssueRef = { id: string; title: string; category?: string }

type CommentRow = {
    id: string
    body: string
    created_at: string
    like_count: number
    dislike_count: number
    parent_id: string | null
    issues: IssueRef | null
}

type DiscussionRow = {
    id: string
    body: string
    created_at: string
    like_count: number
    dislike_count: number
    parent_id: string | null
    discussion_topics: {
        id: string
        body: string
        issues: IssueRef | null
    } | null
}

type VoteRow = {
    id: string
    created_at: string
    vote_choice_id: string | null
    vote_choices: { id: string; label: string; count: number } | null
    votes: {
        id: string
        title: string | null
        phase: string
        issues: IssueRef | null
        vote_choices: { id: string; count: number }[]
    } | null
}

interface MypageClientProps {
    userId: string
    provider: string
    displayName: string
    joinedAt: string
    marketingAgreed: boolean
    contactEmail: string | null
    providerAccount: string | null
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
    displayName,
    joinedAt,
    marketingAgreed: initialMarketing,
    contactEmail: initialContactEmail,
    providerAccount,
    isAdmin = false,
    comments,
    discussions,
    votes,
}: MypageClientProps) {
    const [tab, setTab] = useState<Tab>('profile')
    const [tabVisible, setTabVisible] = useState(true)

    const handleTabChange = (key: Tab) => {
        setTabVisible(false)
        setTimeout(() => { setTab(key); setTabVisible(true) }, 120)
    }

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

    // 알림 수신 이메일
    const [contactEmail, setContactEmail] = useState(initialContactEmail ?? '')
    const [contactEmailInput, setContactEmailInput] = useState(initialContactEmail ?? '')
    const [isEditingContactEmail, setIsEditingContactEmail] = useState(false)
    const [isSavingContactEmail, setIsSavingContactEmail] = useState(false)
    const [contactEmailError, setContactEmailError] = useState<string | null>(null)
    const [contactEmailSuccess, setContactEmailSuccess] = useState(false)

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

    const handleSaveContactEmail = async () => {
        const trimmed = contactEmailInput.trim()
        if (trimmed) {
            const emailErr = validateEmail(trimmed)
            if (emailErr) {
                setContactEmailError(emailErr)
                return
            }
        }
        setIsSavingContactEmail(true)
        setContactEmailError(null)
        setContactEmailSuccess(false)
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactEmail: contactEmailInput.trim() || null }),
            })
            if (res.ok) {
                setContactEmail(contactEmailInput.trim())
                setIsEditingContactEmail(false)
                setContactEmailSuccess(true)
            } else {
                setContactEmailError('저장에 실패했습니다.')
            }
        } catch {
            setContactEmailError('서버 오류가 발생했습니다.')
        } finally {
            setIsSavingContactEmail(false)
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
                <div className="w-14 h-14 rounded-full bg-surface shadow-sm flex items-center justify-center text-2xl font-bold text-primary border border-primary-muted shrink-0 leading-none select-none">
                    {initial}
                </div>
                <div className="min-w-0">
                    <p className="text-lg font-bold text-content-primary">{nickname}</p>
                    {providerAccount && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none shrink-0 ${providerInfo.badgeClass}`}>
                                {providerInfo.badge}
                            </div>
                            <span className="text-xs text-content-muted truncate">{providerAccount}</span>
                        </div>
                    )}
                    <p className="text-xs text-content-muted mt-1">가입일 {formatDate(joinedAt)}</p>
                </div>
            </div>

            {/* 탭 */}
            <div className="flex flex-wrap gap-1.5 mb-6">
                {tabs.map(({ key, label, count }) => (
                    <button
                        key={key}
                        onClick={() => handleTabChange(key)}
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

                    {/* 서비스 알림 이메일 */}
                    <section className="card p-5">
                        <h2 className="text-sm font-semibold text-content-secondary mb-1">서비스 알림 이메일</h2>
                        <p className="text-xs text-content-muted mb-3">서비스 운영 알림(필수) 및 이벤트 수신 동의(선택) 시 사용됩니다.</p>
                        {isAdmin ? (
                            <div>
                                <input
                                    type="email"
                                    value={contactEmail ?? ''}
                                    disabled
                                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface-subtle text-content-disabled cursor-not-allowed"
                                />
                                <p className="mt-2 text-xs text-content-muted">관리자 계정은 가입 이메일({contactEmail})로 고정됩니다.</p>
                            </div>
                        ) : isEditingContactEmail ? (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={contactEmailInput}
                                        onChange={(e) => {
                                            setContactEmailInput(e.target.value)
                                            setContactEmailError(null)
                                            setContactEmailSuccess(false)
                                        }}
                                        placeholder="이메일 주소 입력"
                                        className="flex-1 px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <button
                                        onClick={handleSaveContactEmail}
                                        disabled={isSavingContactEmail}
                                        className="btn-primary btn-sm"
                                    >
                                        {isSavingContactEmail ? '저장 중...' : '저장'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setContactEmailInput(contactEmail)
                                            setIsEditingContactEmail(false)
                                            setContactEmailError(null)
                                        }}
                                        className="btn-neutral btn-sm"
                                    >
                                        취소
                                    </button>
                                </div>
                                {contactEmailError && <p className="text-xs text-red-600">{contactEmailError}</p>}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-content-primary">
                                    {contactEmail || <span className="text-content-muted">설정된 이메일이 없습니다</span>}
                                </span>
                                <button
                                    onClick={() => {
                                        setContactEmailInput(contactEmail)
                                        setIsEditingContactEmail(true)
                                        setContactEmailSuccess(false)
                                    }}
                                    className="text-xs text-primary hover:underline ml-2 shrink-0"
                                >
                                    {contactEmail ? '변경' : '설정'}
                                </button>
                            </div>
                        )}
                        {contactEmailSuccess && !isEditingContactEmail && (
                            <p className="mt-2 text-xs text-green-600">저장되었습니다.</p>
                        )}
                    </section>

                    {/* 마케팅 수신 동의 */}
                    <section className="card p-5">
                        <h2 className="text-sm font-semibold text-content-secondary mb-3">이벤트·혜택 알림 수신 동의</h2>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-content-secondary">위 이메일로 이벤트·혜택 정보를 받습니다.</span>
                            {isAdmin ? (
                                <div
                                    className="relative w-9 h-5 rounded-full bg-primary shrink-0 ml-4 cursor-not-allowed opacity-60"
                                    title="관리자 계정은 변경할 수 없습니다"
                                >
                                    <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow translate-x-4" />
                                </div>
                            ) : (
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
                            )}
                        </div>
                        {isAdmin && (
                            <p className="mt-2 text-xs text-content-muted">관리자 계정은 변경할 수 없습니다.</p>
                        )}
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
                <div className={`space-y-3 transition-opacity duration-150 ${tabVisible ? 'opacity-100' : 'opacity-0'}`}>
                    {comments.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">작성한 댓글이 없습니다.</p>
                    ) : (
                        comments.map((c) => (
                            <div
                                key={c.id}
                                className="card-hover p-4 cursor-pointer"
                                onClick={() => {
                                    if (!c.issues) return
                                    const anchor = `#comment-${c.id}`
                                    const base = `/issue/${c.issues.id}`
                                    window.location.href = c.parent_id
                                        ? `${base}?reply_parent=${c.parent_id}${anchor}`
                                        : `${base}${anchor}`
                                }}
                            >
                                {c.issues && (
                                    <div className="mb-3 pb-3 border-b border-border-muted">
                                        <p className="text-xs text-content-muted truncate">{c.issues.title}</p>
                                    </div>
                                )}
                                <p className="text-sm text-content-primary line-clamp-3 mb-3">{c.body}</p>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-content-muted">작성일 <span className="ml-1">{formatDate(c.created_at)}</span></p>
                                    <div className="flex items-center gap-0.5">
                                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 text-content-muted">
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                            <span>{c.like_count}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 text-content-muted">
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                            <span>{c.dislike_count}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 내 토론 탭 */}
            {tab === 'discussions' && (
                <div className={`space-y-3 transition-opacity duration-150 ${tabVisible ? 'opacity-100' : 'opacity-0'}`}>
                    {discussions.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">참여한 토론이 없습니다.</p>
                    ) : (
                        discussions.map((d) => (
                            <div
                                key={d.id}
                                className="card-hover p-4 cursor-pointer"
                                onClick={() => {
                                    if (!d.discussion_topics) return
                                    const anchor = `#dc-${d.id}`
                                    const base = `/community/${d.discussion_topics.id}`
                                    window.location.href = d.parent_id
                                        ? `${base}?reply_parent=${d.parent_id}${anchor}`
                                        : `${base}${anchor}`
                                }}
                            >
                                {(d.discussion_topics?.issues || d.discussion_topics) && (
                                    <div className="mb-3 pb-3 border-b border-border-muted space-y-1">
                                        {d.discussion_topics?.issues && (
                                            <Link
                                                href={`/issue/${d.discussion_topics.issues.id}`}
                                                className="text-xs text-content-muted hover:underline block truncate"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {d.discussion_topics.issues.title}
                                            </Link>
                                        )}
                                        {d.discussion_topics && (
                                            <p className="text-[13px] font-medium text-content-secondary line-clamp-2">
                                                {d.discussion_topics.body}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <p className="text-sm text-content-primary line-clamp-3 mb-3">{d.body}</p>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-content-muted">작성일 <span className="ml-1">{formatDate(d.created_at)}</span></p>
                                    <div className="flex items-center gap-0.5">
                                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 text-content-muted">
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                            <span>{d.like_count}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 text-content-muted">
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                            <span>{d.dislike_count}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 내 투표 탭 */}
            {tab === 'votes' && (
                <div className={`space-y-3 transition-opacity duration-150 ${tabVisible ? 'opacity-100' : 'opacity-0'}`}>
                    {votes.length === 0 ? (
                        <p className="text-center text-content-muted py-12 text-sm">참여한 투표가 없습니다.</p>
                    ) : (
                        <>
                        {/* 투표 통계 요약 */}
                        {(() => {
                            const validVotes = votes.filter(v => v.vote_choice_id && v.votes?.vote_choices?.length)
                            const matchCount = validVotes.filter(v => {
                                const allChoices = v.votes!.vote_choices
                                const maxCount = Math.max(...allChoices.map((c: { id: string; count: number }) => c.count))
                                const topChoiceId = allChoices.find((c: { id: string; count: number }) => c.count === maxCount)?.id
                                return v.vote_choice_id === topChoiceId
                            }).length
                            const matchRatio = validVotes.length > 0 ? Math.round((matchCount / validVotes.length) * 100) : 0

                            const categoryMap: Record<string, { total: number; match: number }> = {}
                            validVotes.forEach(v => {
                                const cat = v.votes?.issues?.category ?? '기타'
                                const allChoices = v.votes!.vote_choices
                                const maxCount = Math.max(...allChoices.map((c: { id: string; count: number }) => c.count))
                                const topChoiceId = allChoices.find((c: { id: string; count: number }) => c.count === maxCount)?.id
                                const isMatch = v.vote_choice_id === topChoiceId
                                if (!categoryMap[cat]) categoryMap[cat] = { total: 0, match: 0 }
                                categoryMap[cat].total++
                                if (isMatch) categoryMap[cat].match++
                            })

                            return (
                                <div className="card p-4 mb-1">
                                    <h3 className="text-[13px] font-semibold text-content-secondary mb-3">나의 투표 성향</h3>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <div className="bg-surface-muted rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-content-primary">{validVotes.length}</p>
                                            <p className="text-[13px] text-content-muted mt-0.5">총 참여</p>
                                        </div>
                                        <div className="bg-primary-light/40 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-primary">{matchRatio}%</p>
                                            <p className="text-[13px] text-primary/70 mt-0.5">다수 의견 일치</p>
                                        </div>
                                        <div className="bg-surface-muted rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-content-secondary">{100 - matchRatio}%</p>
                                            <p className="text-[13px] text-content-muted mt-0.5">나만의 선택</p>
                                        </div>
                                    </div>
                                    {Object.keys(categoryMap).length > 1 && (
                                        <div>
                                            <p className="text-[13px] font-semibold text-content-secondary mb-2">카테고리별 다수 의견 일치율</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(categoryMap).map(([cat, { total, match }]) => {
                                                    const pct = Math.round((match / total) * 100)
                                                    return (
                                                        <div key={cat} className="bg-surface-muted rounded-xl p-3">
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-[13px] font-medium text-content-secondary">{cat}</span>
                                                                <span className="text-[13px] font-bold text-primary">{pct}%</span>
                                                            </div>
                                                            <p className="text-[12px] text-content-muted">{total}번 중 {match}번 일치</p>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                        {votes.map((v) => {
                            const myCount = v.vote_choices?.count ?? 0
                            const total = (v.votes?.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0)
                            const ratio = total > 0 ? Math.round((myCount / total) * 100) : 0
                            return (
                                <div key={v.id} className="card-hover p-4 cursor-pointer" onClick={() => {
                                    if (v.votes?.issues) window.location.href = `/issue/${v.votes.issues.id}#section-vote`
                                }}>
                                    {/* 컨텍스트: 이슈 + 투표 정보 */}
                                    <div className="mb-3 pb-3 border-b border-border-muted">
                                        {v.votes?.issues && (
                                            <p className="text-xs text-content-muted truncate mb-1.5">{v.votes.issues.title}</p>
                                        )}
                                        <div className="flex items-center gap-2">
                                            {v.votes?.phase && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                                    v.votes.phase === '진행중'
                                                        ? 'bg-green-50 text-green-700'
                                                        : 'bg-surface-subtle text-content-muted'
                                                }`}>
                                                    {v.votes.phase}
                                                </span>
                                            )}
                                            {v.votes?.title && (
                                                <p className="text-[13px] font-medium text-content-primary line-clamp-2">{v.votes.title}</p>
                                            )}
                                        </div>
                                    </div>
                                    {/* 내 선택 */}
                                    {v.vote_choices && (
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xs text-content-muted shrink-0">내 선택</span>
                                            <span className="text-xs px-2 py-0.5 bg-primary-light text-primary rounded-full font-medium">
                                                {v.vote_choices.label}
                                            </span>
                                            <span className="text-xs text-content-muted ml-auto">
                                                {myCount.toLocaleString()}표 · {ratio}%
                                            </span>
                                        </div>
                                    )}
                                    {/* 날짜 */}
                                    <p className="text-xs text-content-muted">투표일 <span className="ml-1">{formatDate(v.created_at)}</span></p>
                                </div>
                            )
                        })}
                        </>
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
