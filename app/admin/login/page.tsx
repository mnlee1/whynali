'use client'

/**
 * app/admin/login/page.tsx
 *
 * 관리자 전용 로그인 페이지.
 * @nhnad.com 이메일 + 비밀번호로 로그인.
 * 계정은 Supabase 대시보드에서 직접 생성.
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

const SAVED_EMAIL_KEY = 'admin_saved_email'

export default function AdminLoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [saveEmail, setSaveEmail] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const saved = localStorage.getItem(SAVED_EMAIL_KEY)
        if (saved) {
            setEmail(saved)
            setSaveEmail(true)
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!email.trim().toLowerCase().endsWith('@nhnad.com')) {
            setError('@nhnad.com 계정만 로그인이 가능합니다.')
            return
        }

        if (saveEmail) {
            localStorage.setItem(SAVED_EMAIL_KEY, email.trim())
        } else {
            localStorage.removeItem(SAVED_EMAIL_KEY)
        }

        setLoading(true)
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            })

            if (signInError) {
                setError('이메일 또는 비밀번호가 올바르지 않습니다.')
                return
            }

            // router.push 대신 전체 리로드: 미들웨어가 signInWithPassword 후 설정된
            // 세션 쿠키를 확실히 읽도록 하기 위함. SPA 이동 시 타이밍 이슈로 미들웨어가
            // 세션 없음으로 판단해 /admin/login 으로 다시 리다이렉트되는 문제 방지.
            window.location.href = '/admin'
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* 1280px 미만: 데스크톱 전용 안내 */}
            <div className="flex xl:hidden flex-col items-center justify-center min-h-[60vh] px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                </div>
                <h2 className="text-lg font-semibold text-content-primary mb-2">데스크톱에서 이용해주세요</h2>
                <p className="text-sm text-content-secondary mb-6 break-keep">
                    관리자 페이지는 데스크톱 환경에 최적화되어 있습니다.<br />
                    PC 또는 태블릿(가로 모드)에서 접속해주세요.
                </p>
            </div>

            {/* 1280px 이상: 로그인 폼 */}
            <div className="hidden xl:flex w-full min-h-[calc(100svh-3.5rem)] flex-col justify-center px-4 py-8 max-w-sm mx-auto">
                <div className="text-center mb-5 sm:mb-8">
                    <h1 className="text-2xl font-bold text-content-primary mb-2">관리자 로그인</h1>
                    <p className="text-sm text-content-secondary">@nhnad.com 계정으로 로그인하세요.</p>
                </div>

                {error && (
                    <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="w-full space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">
                            이메일
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@nhnad.com"
                            required
                            autoComplete="email"
                            className="w-full px-6 py-3 border border-border rounded-full text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
                            <input
                                type="checkbox"
                                checked={saveEmail}
                                onChange={(e) => setSaveEmail(e.target.checked)}
                                className="w-3.5 h-3.5 accent-primary"
                            />
                            <span className="text-xs text-content-muted">이메일 저장</span>
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">
                            비밀번호
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="비밀번호"
                            required
                            autoComplete="current-password"
                            className="w-full px-6 py-3 border border-border rounded-full text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary btn-lg w-full"
                    >
                        {loading ? '로그인 중...' : '로그인'}
                    </button>
                </form>
            </div>
        </>
    )
}
