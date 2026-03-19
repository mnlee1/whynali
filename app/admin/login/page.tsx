'use client'

/**
 * app/admin/login/page.tsx
 *
 * 관리자 전용 로그인 페이지.
 * @nhnad.com 이메일 + 비밀번호로 로그인.
 * 계정은 Supabase 대시보드에서 직접 생성.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function AdminLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!email.trim().toLowerCase().endsWith('@nhnad.com')) {
            setError('@nhnad.com 계정만 로그인이 가능합니다.')
            return
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

            router.push('/admin')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-sm mx-auto mt-16">
            <h1 className="text-lg font-semibold text-neutral-800 mb-6">관리자 로그인</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        이메일
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@nhnad.com"
                        required
                        autoComplete="email"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        비밀번호
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="비밀번호"
                        required
                        autoComplete="current-password"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    {loading ? '로그인 중...' : '로그인'}
                </button>
            </form>
        </div>
    )
}
