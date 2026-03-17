/**
 * app/onboarding/OnboardingClient.tsx
 *
 * [온보딩 클라이언트 컴포넌트]
 *
 * 약관 동의 및 닉네임 설정 UI를 제공합니다.
 * - 닉네임 다시 추천 (최대 3회)
 * - 약관 내용 토글
 * - 전체 동의 체크박스
 * - 시작하기 버튼
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface OnboardingClientProps {
    initialNickname: string
}

const TERMS_SERVICE = `
왜난리 서비스 이용약관

1. 서비스 이용 목적 및 범위
본 서비스는 한국의 주요 이슈를 확인하고 여론을 파악하기 위한 정보 제공 서비스입니다.

2. 금지 행위
- 욕설, 혐오 표현, 허위 정보 유포
- 타인의 권리를 침해하는 행위
- 서비스 운영을 방해하는 행위

3. 운영자 콘텐츠 관리 권한
운영자는 서비스 품질 유지를 위해 부적절한 콘텐츠를 관리할 수 있습니다.

4. 서비스 변경 및 중단
서비스는 사전 고지 후 변경되거나 중단될 수 있습니다.
`

const TERMS_PRIVACY = `
개인정보 처리방침

1. 수집하는 개인정보 항목
- 소셜 계정 식별자 (Google, Kakao, Naver)
- 닉네임 (서비스 내 표시용)

2. 개인정보 수집 및 이용 목적
- 서비스 이용자 식별
- 댓글, 투표 등 서비스 기능 제공

3. 개인정보 보유 및 이용 기간
- 회원 탈퇴 시까지

4. 개인정보 제3자 제공
- 제3자에게 개인정보를 제공하지 않습니다.
`

export default function OnboardingClient({ initialNickname }: OnboardingClientProps) {
    const router = useRouter()
    
    const [nickname, setNickname] = useState(initialNickname)
    const [regenerateCount, setRegenerateCount] = useState(0)
    const [isRegenerating, setIsRegenerating] = useState(false)
    
    const [termsService, setTermsService] = useState(false)
    const [termsPrivacy, setTermsPrivacy] = useState(false)
    const [marketing, setMarketing] = useState(false)
    
    const [showServiceTerms, setShowServiceTerms] = useState(false)
    const [showPrivacyTerms, setShowPrivacyTerms] = useState(false)
    
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRegenerate = async () => {
        if (regenerateCount >= 3) return
        
        setIsRegenerating(true)
        try {
            const res = await fetch('/api/onboarding/nickname')
            const data = await res.json()
            if (data.nickname) {
                setNickname(data.nickname)
                setRegenerateCount(prev => prev + 1)
            }
        } catch (err) {
            console.error('닉네임 재생성 오류:', err)
        } finally {
            setIsRegenerating(false)
        }
    }

    const handleAllAgree = (checked: boolean) => {
        setTermsService(checked)
        setTermsPrivacy(checked)
        setMarketing(checked)
    }

    const handleSubmit = async () => {
        if (!termsService || !termsPrivacy) {
            setError('필수 약관에 동의해주세요.')
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nickname,
                    marketingAgreed: marketing
                })
            })

            const data = await res.json()

            if (res.status === 409 && data.suggestion) {
                setNickname(data.suggestion)
                setError('닉네임이 중복되어 새로운 닉네임을 추천했습니다.')
                setIsSubmitting(false)
                return
            }

            if (!res.ok) {
                setError(data.error || '온보딩에 실패했습니다.')
                setIsSubmitting(false)
                return
            }

            router.push('/')
        } catch (err) {
            console.error('온보딩 제출 오류:', err)
            setError('서버 오류가 발생했습니다.')
            setIsSubmitting(false)
        }
    }

    const isFormValid = termsService && termsPrivacy

    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">왜난리 시작하기</h1>
                <p className="text-gray-600">약관 동의 및 닉네임 설정을 완료해주세요</p>
            </div>

            <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h2 className="text-lg font-semibold mb-4">닉네임</h2>
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 px-4 py-3 bg-white rounded-lg border border-gray-300 font-medium">
                        {nickname}
                    </div>
                    <button
                        onClick={handleRegenerate}
                        disabled={regenerateCount >= 3 || isRegenerating}
                        className="px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                        {isRegenerating ? '생성 중...' : '다른 닉네임'}
                    </button>
                </div>
                <p className="text-sm text-gray-500">
                    {regenerateCount >= 3 
                        ? '추천 횟수를 모두 사용했습니다. 마이페이지에서 변경 가능합니다.'
                        : `닉네임은 마이페이지에서 변경할 수 있어요 (${regenerateCount}/3)`
                    }
                </p>
            </div>

            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">약관 동의</h2>
                
                <div className="mb-4 p-4 border border-gray-300 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={termsService && termsPrivacy && marketing}
                            onChange={(e) => handleAllAgree(e.target.checked)}
                            className="w-5 h-5"
                        />
                        <span className="font-medium">전체 동의</span>
                    </label>
                </div>

                <div className="space-y-4">
                    <div className="border border-gray-300 rounded-lg p-4">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                                type="checkbox"
                                checked={termsService}
                                onChange={(e) => setTermsService(e.target.checked)}
                                className="w-5 h-5"
                            />
                            <span className="font-medium">[필수] 서비스 이용약관 동의</span>
                        </label>
                        <button
                            onClick={() => setShowServiceTerms(!showServiceTerms)}
                            className="text-sm text-blue-500 hover:underline"
                        >
                            {showServiceTerms ? '접기' : '내용 보기'}
                        </button>
                        {showServiceTerms && (
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line max-h-48 overflow-y-auto">
                                {TERMS_SERVICE}
                            </div>
                        )}
                    </div>

                    <div className="border border-gray-300 rounded-lg p-4">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                                type="checkbox"
                                checked={termsPrivacy}
                                onChange={(e) => setTermsPrivacy(e.target.checked)}
                                className="w-5 h-5"
                            />
                            <span className="font-medium">[필수] 개인정보 처리방침 동의</span>
                        </label>
                        <button
                            onClick={() => setShowPrivacyTerms(!showPrivacyTerms)}
                            className="text-sm text-blue-500 hover:underline"
                        >
                            {showPrivacyTerms ? '접기' : '내용 보기'}
                        </button>
                        {showPrivacyTerms && (
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line max-h-48 overflow-y-auto">
                                {TERMS_PRIVACY}
                            </div>
                        )}
                    </div>

                    <div className="border border-gray-300 rounded-lg p-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={marketing}
                                onChange={(e) => setMarketing(e.target.checked)}
                                className="w-5 h-5"
                            />
                            <span className="font-medium">[선택] 마케팅 수신 동의</span>
                        </label>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
                {isSubmitting ? '처리 중...' : '시작하기'}
            </button>
        </div>
    )
}
