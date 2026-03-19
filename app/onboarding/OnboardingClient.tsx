/**
 * app/onboarding/OnboardingClient.tsx
 *
 * [온보딩 클라이언트 컴포넌트]
 *
 * 약관 동의 및 닉네임 설정 UI를 제공합니다.
 * - 닉네임 다시 추천 (최대 3회)
 * - 약관 내용 토글
 * - 전체 동의 체크박스
 * - 만 14세 이상 확인 (정보통신망법 제31조)
 * - 시작하기 버튼
 */

'use client'

import { useState, useEffect } from 'react'

interface OnboardingClientProps {
    initialNickname: string
}

const TERMS_SERVICE = `왜난리 서비스 이용약관

1. 서비스 이용 목적 및 범위
본 서비스(왜난리)는 한국의 주요 이슈를 확인하고 여론을 파악하기 위한 정보 제공 서비스입니다. 만 14세 이상이면 누구나 이용할 수 있습니다.

2. 금지 행위
이용자는 다음 행위를 해서는 안 됩니다.
- 욕설, 혐오 표현, 허위 정보 유포
- 타인의 명예를 훼손하거나 권리를 침해하는 행위
- 서비스 운영을 방해하는 행위
- 타인의 계정을 도용하거나 개인정보를 무단 수집하는 행위

3. 운영자 콘텐츠 관리 권한
운영자는 서비스 품질 유지를 위해 부적절한 콘텐츠를 사전 고지 없이 삭제하거나 이용을 제한할 수 있습니다.

4. 책임 제한
운영자는 천재지변, 서비스 장애, 이용자 귀책 사유로 발생한 손해에 대해 책임을 지지 않습니다. 이용자가 게시한 정보의 신뢰성·정확성에 대해서도 책임지지 않습니다.

5. 서비스 변경 및 중단
서비스는 운영상 필요에 의해 사전 고지 후 변경되거나 중단될 수 있습니다. 긴급한 경우 사후 고지할 수 있습니다.

6. 준거법 및 관할 법원
본 약관은 대한민국 법률에 따르며, 분쟁 발생 시 서울중앙지방법원을 전속 관할 법원으로 합니다.

시행일: 2025년 1월 1일`

const TERMS_PRIVACY = `개인정보 처리방침

1. 수집하는 개인정보 항목
- 소셜 계정 식별자 (Google, Kakao, Naver 고유 ID)
- 이메일 주소 (소셜 로그인 제공 시)
- 닉네임 (서비스 내 표시용, 직접 설정)

2. 개인정보 수집 및 이용 목적
- 서비스 이용자 식별 및 인증
- 댓글, 투표 등 참여형 서비스 기능 제공
- 서비스 품질 개선 및 이용 통계 분석

3. 개인정보 보유 및 이용 기간
회원 탈퇴 시까지 보유합니다. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보유합니다.

4. 개인정보 제3자 제공
이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 이용자의 사전 동의가 있거나 법령에 의한 경우는 예외입니다.

5. 개인정보 처리 위탁
- Supabase Inc.: 사용자 인증 및 데이터 저장
- Vercel Inc.: 서비스 호스팅

6. 이용자 권리
이용자는 언제든지 개인정보 열람, 정정, 삭제를 요청할 수 있습니다. 문의: whynali.contact@gmail.com

7. 개인정보 보호 담당자
담당자: 왜난리 운영팀 / 이메일: whynali.contact@gmail.com

시행일: 2025년 1월 1일`

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

    const [showServiceTerms, setShowServiceTerms] = useState(false)
    const [showPrivacyTerms, setShowPrivacyTerms] = useState(false)
    const [showMarketingTerms, setShowMarketingTerms] = useState(false)

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
                        className="px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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
                            type="checkbox"
                            checked={termsService && termsPrivacy && ageConfirmed && marketing}
                            onChange={(e) => handleAllAgree(e.target.checked)}
                            className="w-5 h-5"
                        />
                        <span className="font-medium">전체 동의</span>
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
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowServiceTerms(!showServiceTerms)}
                                className="text-sm text-blue-500 hover:underline"
                            >
                                {showServiceTerms ? '접기' : '내용 보기'}
                            </button>
                            <a
                                href="/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-gray-400 hover:underline"
                            >
                                전문 보기 ↗
                            </a>
                        </div>
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
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowPrivacyTerms(!showPrivacyTerms)}
                                className="text-sm text-blue-500 hover:underline"
                            >
                                {showPrivacyTerms ? '접기' : '내용 보기'}
                            </button>
                            <a
                                href="/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-gray-400 hover:underline"
                            >
                                전문 보기 ↗
                            </a>
                        </div>
                        {showPrivacyTerms && (
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line max-h-48 overflow-y-auto">
                                {TERMS_PRIVACY}
                            </div>
                        )}
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
                        <button
                            onClick={() => setShowMarketingTerms(!showMarketingTerms)}
                            className="text-sm text-blue-500 hover:underline"
                        >
                            {showMarketingTerms ? '접기' : '내용 보기'}
                        </button>
                        {showMarketingTerms && (
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm whitespace-pre-line max-h-48 overflow-y-auto">
                                {`마케팅 정보 수신 동의 (선택)\n\n수집 항목: 닉네임, 서비스 이용 기록\n수집 목적: 서비스 업데이트 안내, 이벤트·프로모션 정보 제공\n보유 기간: 동의 철회 시까지\n\n동의를 거부할 권리가 있으며, 거부 시에도 기본 서비스 이용에는 불이익이 없습니다.\n마케팅 수신 동의는 마이페이지에서 언제든지 변경할 수 있습니다.`}
                            </div>
                        )}
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
