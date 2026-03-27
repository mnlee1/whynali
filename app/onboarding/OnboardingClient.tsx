/**
 * app/onboarding/OnboardingClient.tsx
 *
 * [온보딩 클라이언트 컴포넌트]
 *
 * 약관 동의 및 닉네임 설정 UI를 제공합니다.
 * - 닉네임 직접 입력 또는 랜덤 생성 (최대 5회)
 * - 전체 동의 체크박스 (필수 3개 + 선택 마케팅 1개)
 * - 만 14세 이상 확인 (정보통신망법 제31조)
 * - 약관 전문은 /terms, /privacy 페이지 링크로 제공
 * - 시작하기 버튼
 */

'use client'

import { useState, useEffect, useRef } from 'react'

interface OnboardingClientProps {
    initialNickname: string
}

export default function OnboardingClient({ initialNickname }: OnboardingClientProps) {


    const [nickname, setNickname] = useState(initialNickname)
    const [regenerateCount, setRegenerateCount] = useState(0)
    const [isRegenerating, setIsRegenerating] = useState(false)

    const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/
    const nicknameValid = nickname.length >= 2 && nickname.length <= 16 && NICKNAME_REGEX.test(nickname)
    const nicknameValidationMsg = (() => {
        if (nickname.length === 0) return null
        if (nickname.length < 2) return '2자 이상 입력해주세요.'
        if (nickname.length > 16) return '16자 이하로 입력해주세요.'
        if (!NICKNAME_REGEX.test(nickname)) return '한글, 영문, 숫자, _만 사용할 수 있습니다.'
        return null
    })()

    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)
    const [isDuplicate, setIsDuplicate] = useState<boolean | null>(null)

    useEffect(() => {
        if (!nicknameValid) {
            setIsDuplicate(null)
            return
        }
        setIsCheckingDuplicate(true)
        setIsDuplicate(null)
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/users/nickname/check?nickname=${encodeURIComponent(nickname)}`)
                const data = await res.json()
                setIsDuplicate(!data.available)
            } catch {
                setIsDuplicate(null)
            } finally {
                setIsCheckingDuplicate(false)
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [nickname, nicknameValid])

    const [termsService, setTermsService] = useState(false)
    const [termsPrivacy, setTermsPrivacy] = useState(false)
    const [ageConfirmed, setAgeConfirmed] = useState(false)
    const [marketing, setMarketing] = useState(false)

    // 전체 동의: 필수 3개는 모두 체크, 선택(마케팅)은 미체크 → indeterminate 상태
    const allRequired = termsService && termsPrivacy && ageConfirmed
    const allChecked = allRequired && marketing
    const isIndeterminate = allRequired && !marketing
    const allAgreeRef = useRef<HTMLInputElement>(null)
    useEffect(() => {
        if (allAgreeRef.current) {
            allAgreeRef.current.indeterminate = isIndeterminate
        }
    }, [isIndeterminate])

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRegenerate = async () => {
        if (regenerateCount >= 5) return

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
        setAgeConfirmed(checked)
        setMarketing(checked)
    }

    const handleSubmit = async () => {
        if (!nicknameValid) {
            setError('닉네임 조건을 확인해주세요.')
            return
        }
        if (!termsService || !termsPrivacy || !ageConfirmed) {
            setError('필수 항목을 모두 확인해주세요.')
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

            window.location.replace('/')
        } catch (err) {
            console.error('온보딩 제출 오류:', err)
            setError('서버 오류가 발생했습니다.')
            setIsSubmitting(false)
        }
    }

    const isFormValid = nicknameValid && isDuplicate === false && termsService && termsPrivacy && ageConfirmed

    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">왜난리 시작하기</h1>
                <p className="text-gray-600">약관 동의 및 닉네임 설정을 완료해주세요</p>
            </div>

            <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h2 className="text-lg font-semibold mb-1">닉네임</h2>
                <p className="text-xs text-gray-400 mb-3">한글·영문·숫자·_ 사용 가능, 2~16자</p>
                <div className="flex items-center gap-3 mb-2">
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={16}
                        className={`flex-1 px-4 py-3 bg-white rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            nicknameValidationMsg ? 'border-red-400' : nicknameValid ? 'border-green-400' : 'border-gray-300'
                        }`}
                        placeholder="닉네임 입력"
                    />
                    <button
                        onClick={handleRegenerate}
                        disabled={regenerateCount >= 5 || isRegenerating}
                        className="btn-primary btn-md whitespace-nowrap"
                    >
                        {isRegenerating ? '생성 중...' : '랜덤 생성'}
                    </button>
                </div>
                {nicknameValidationMsg ? (
                    <p className="text-xs text-red-500">{nicknameValidationMsg}</p>
                ) : nicknameValid ? (
                    isCheckingDuplicate ? (
                        <p className="text-xs text-gray-400">중복 확인 중...</p>
                    ) : isDuplicate === true ? (
                        <p className="text-xs text-red-500">이미 사용 중인 닉네임입니다.</p>
                    ) : isDuplicate === false ? (
                        <p className="text-xs text-green-600">사용 가능한 닉네임입니다.</p>
                    ) : null
                ) : (
                    <p className="text-xs text-gray-500">
                        랜덤 닉네임을 사용하거나 직접 입력할 수 있어요 ({regenerateCount}/5)
                    </p>
                )}
            </div>

            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">약관 동의</h2>

                <div className="mb-4 p-4 border border-gray-300 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            ref={allAgreeRef}
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => handleAllAgree(e.target.checked)}
                            className="w-5 h-5"
                        />
                        <span className="font-medium">전체 동의</span>
                        <span className="text-xs text-gray-400">(선택 항목 포함)</span>
                    </label>
                </div>

                <div className="space-y-4">
                    <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={ageConfirmed}
                                onChange={(e) => setAgeConfirmed(e.target.checked)}
                                className="w-5 h-5"
                            />
                            <span className="font-medium">[필수] 본인은 만 14세 이상입니다</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-2 ml-7">
                            정보통신망법 제31조에 따라 만 14세 미만은 법정대리인의 동의가 필요합니다.
                        </p>
                    </div>

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
                        <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:underline"
                        >
                            전문 보기 ↗
                        </a>
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
                        <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:underline"
                        >
                            전문 보기 ↗
                        </a>
                    </div>

                    <div className="border border-gray-300 rounded-lg p-4">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                                type="checkbox"
                                checked={marketing}
                                onChange={(e) => setMarketing(e.target.checked)}
                                className="w-5 h-5"
                            />
                            <span className="font-medium">[선택] 마케팅 수신 동의</span>
                        </label>
                        <p className="text-xs text-gray-500 ml-7">
                            이메일 주소를 통해 서비스 업데이트, 이벤트·혜택 정보를 받습니다.
                            동의하지 않아도 서비스 이용에 불이익이 없으며, 마이페이지에서 언제든지 변경 가능합니다.
                        </p>
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
                className="btn-primary btn-lg w-full"
            >
                {isSubmitting ? '처리 중...' : '시작하기'}
            </button>
        </div>
    )
}
