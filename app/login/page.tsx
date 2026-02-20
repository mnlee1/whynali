'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type OAuthProvider = 'google' | 'kakao'

export default function LoginPage() {
    const [loading, setLoading] = useState<OAuthProvider | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleOAuth = async (provider: OAuthProvider) => {
        setLoading(provider)
        setError(null)
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        })
        if (error) {
            setError(error.message)
            setLoading(null)
        }
    }

    return (
        <div className="container mx-auto px-4 py-12 max-w-sm">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">로그인</h1>
                <p className="text-sm text-gray-500">
                    로그인하면 감정 표현, 댓글, 투표에 참여할 수 있습니다.
                </p>
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-3">
                <button
                    onClick={() => handleOAuth('google')}
                    disabled={loading !== null}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    {loading === 'google' ? '연결 중...' : 'Google로 로그인'}
                </button>

                <button
                    onClick={() => handleOAuth('kakao')}
                    disabled={loading !== null}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-yellow-400 rounded-lg text-sm font-medium text-gray-900 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.61 1.636 4.904 4.125 6.266-.182.676-.66 2.453-.757 2.833-.12.47.173.464.364.338.149-.098 2.367-1.605 3.324-2.255.629.09 1.277.138 1.944.138 5.523 0 10-3.477 10-7.78C21 6.477 17.523 3 12 3z" />
                    </svg>
                    {loading === 'kakao' ? '연결 중...' : 'Kakao로 로그인'}
                </button>
            </div>

            <p className="text-xs text-gray-400 text-center mt-6">
                로그인 시 서비스 이용약관에 동의하는 것으로 간주됩니다.
            </p>
        </div>
    )
}
