/**
 * components/issue/ShareButton.tsx
 *
 * 이슈 공유 버튼 컴포넌트
 * - 짧은 URL 사용 (short_code 기반)
 * - SNS 공유 (트위터, 페이스북, 카카오톡)
 * - 링크 복사 기능
 * - 공유 이벤트 트래킹 (GA)
 */

'use client'

import { useState, useEffect } from 'react'
import { Share2, Copy, Check, Link } from 'lucide-react'
import { initKakao, isKakaoReady } from '@/lib/kakao/init'

interface ShareButtonProps {
    issueId: string
    shortCode?: string
    title: string
    thumbnailUrl?: string // 이슈 대표 이미지
    compact?: boolean // 컴팩트 모드 (아이콘만 표시)
}

export default function ShareButton({ issueId, shortCode, title, thumbnailUrl, compact = false }: ShareButtonProps) {
    const [copied, setCopied] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [kakaoCopied, setKakaoCopied] = useState(false)
    const [kakaoReady, setKakaoReady] = useState(false)
    const [showToast, setShowToast] = useState(false)

    // short_code가 없으면 렌더링하지 않음 (마이그레이션 전 또는 생성 실패)
    if (!shortCode) {
        return null
    }

    const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    
    // 기본 공유 URL (UTM 없음)
    const baseShareUrl = `${baseUrl}/i/${shortCode}`
    
    // 플랫폼별 UTM 추가 함수
    const getShareUrlWithUTM = (platform: string) => {
        return `${baseShareUrl}?utm_source=${platform}&utm_medium=share`
    }

    // Kakao SDK 초기화
    useEffect(() => {
        const checkKakao = () => {
            console.log('[ShareButton] Kakao SDK 체크 중...')
            if (isKakaoReady()) {
                console.log('[ShareButton] Kakao SDK 이미 초기화됨')
                setKakaoReady(true)
            } else if (initKakao()) {
                console.log('[ShareButton] Kakao SDK 초기화 성공')
                setKakaoReady(true)
            } else {
                console.log('[ShareButton] Kakao SDK 초기화 실패')
            }
        }

        // SDK 로드 대기
        if (typeof window !== 'undefined') {
            console.log('[ShareButton] window.Kakao 확인:', !!window.Kakao)
            if (window.Kakao) {
                checkKakao()
            } else {
                console.log('[ShareButton] Kakao SDK 로드 대기 중...')
                const timer = setInterval(() => {
                    if (window.Kakao) {
                        console.log('[ShareButton] Kakao SDK 로드 완료')
                        checkKakao()
                        clearInterval(timer)
                    }
                }, 100)

                // 5초 후에도 로드 안 되면 포기
                setTimeout(() => {
                    clearInterval(timer)
                    if (!window.Kakao) {
                        console.error('[ShareButton] Kakao SDK 로드 타임아웃 (5초)')
                    }
                }, 5000)

                return () => clearInterval(timer)
            }
        }
    }, [])

    const trackShare = (platform: string) => {
        if (typeof window !== 'undefined' && window.gtag) {
            window.gtag('event', 'share', {
                method: platform,
                content_type: 'issue',
                item_id: issueId,
                short_code: shortCode,
            })
        }
    }

    const handleShare = async (platform: string) => {
        console.log('[ShareButton] 공유 플랫폼:', platform)
        trackShare(platform)
        
        const shareUrl = getShareUrlWithUTM(platform)

        // X (트위터) 공유
        if (platform === 'twitter') {
            const tweetText = `${title}\n왜난리에서 이슈 확인하고 투표와 토론에 참여하세요!\n\n🔗 ${shareUrl}\n\n#️⃣ #왜난리 #이슈 #실시간`
            const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`
            window.open(url, '_blank', 'width=600,height=400')
            setShowMenu(false)
        }
        // 카카오톡 공유
        else if (platform === 'kakaotalk') {
            console.log('[ShareButton] 카카오톡 공유 시작')
            console.log('[ShareButton] kakaoReady:', kakaoReady)
            console.log('[ShareButton] window.Kakao:', !!window.Kakao)
            console.log('[ShareButton] shareUrl:', shareUrl)

            if (!kakaoReady || !window.Kakao) {
                console.log('[ShareButton] SDK 없음 → 링크 복사로 폴백')
                // SDK 없으면 링크 복사로 폴백
                try {
                    await navigator.clipboard.writeText(shareUrl)
                    console.log('[ShareButton] 링크 복사 성공')
                    setKakaoCopied(true)
                    setTimeout(() => {
                        setKakaoCopied(false)
                        setShowMenu(false)
                    }, 1500)
                } catch (err) {
                    console.error('[ShareButton] 링크 복사 실패:', err)
                    alert('링크 복사에 실패했습니다')
                    setShowMenu(false)
                }
                return
            }

            // Kakao Share API 사용
            console.log('[ShareButton] Kakao Share API 호출 시작')
            
            // 이미지: 왜난리 공유 전용 이미지 고정 사용 (800x400)
            const imageUrl = 'https://whynali.com/whynali-share-og.png'
            console.log('[ShareButton] 공유 이미지:', imageUrl)
            
            try {
                window.Kakao.Share.sendDefault({
                    objectType: 'feed',
                    content: {
                        title: title,
                        description: '지금 가장 뜨거운 이슈🔥를 한눈에 확인하고 투표와 토론에 참여해보세요.',
                        imageUrl: imageUrl,
                        imageWidth: 800,
                        imageHeight: 400,
                        link: {
                            mobileWebUrl: shareUrl,
                            webUrl: shareUrl,
                        },
                    },
                    social: {
                        likeCount: 0,
                        commentCount: 0,
                        sharedCount: 0,
                    },
                    buttons: [
                        {
                            title: '지금 확인하기',
                            link: {
                                mobileWebUrl: shareUrl,
                                webUrl: shareUrl,
                            },
                        },
                    ],
                })
                console.log('[ShareButton] Kakao Share API 호출 성공')
                setShowMenu(false)
            } catch (err) {
                console.error('[ShareButton] Kakao Share 실패:', err)
                // 실패 시 링크 복사로 폴백
                try {
                    await navigator.clipboard.writeText(shareUrl)
                    setKakaoCopied(true)
                    setTimeout(() => {
                        setKakaoCopied(false)
                        setShowMenu(false)
                    }, 1500)
                } catch (copyErr) {
                    console.error('[ShareButton] 폴백 복사도 실패:', copyErr)
                    alert('공유에 실패했습니다')
                    setShowMenu(false)
                }
            }
        }
    }

    const copyLink = async () => {
        try {
            const shareUrl = getShareUrlWithUTM('copy')
            const copyText = `요즘 난리 한눈에 👀, 왜난리에서 바로 확인하세요!\n${shareUrl}`
            await navigator.clipboard.writeText(copyText)
            setCopied(true)
            setShowToast(true)
            trackShare('copy_link')
            setTimeout(() => {
                setCopied(false)
                setShowToast(false)
            }, 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
        setShowMenu(false)
    }

    // 컴팩트 모드
    if (compact) {
        return (
            <>
            <div className="relative">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-content-secondary hover:bg-surface-subtle hover:text-content-primary transition-colors"
                    aria-label="공유하기"
                >
                    <Share2 className="w-4 h-4" strokeWidth={1.8} />
                </button>

                {showMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 bg-surface rounded-xl shadow-lg border border-border z-50 p-3">
                            <div className="flex items-center gap-2">
                                {/* X (트위터) */}
                                <button
                                    onClick={() => handleShare('twitter')}
                                    className="w-10 h-10 rounded-full bg-[#000000] hover:bg-[#1a1a1a] flex items-center justify-center transition-colors group"
                                    title="X 공유"
                                >
                                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                </button>

                                {/* 카카오톡 */}
                                <button
                                    onClick={() => handleShare('kakaotalk')}
                                    className="w-10 h-10 rounded-full bg-[#FEE500] hover:bg-[#fdd835] flex items-center justify-center transition-colors group relative"
                                    title="카카오톡 공유"
                                >
                                    {kakaoCopied ? (
                                        <Check className="w-5 h-5 text-[#3C1E1E]" strokeWidth={2.5} />
                                    ) : (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 3C6.486 3 2 6.582 2 11c0 2.804 1.863 5.26 4.65 6.709-.232.898-.752 2.926-.862 3.387-.134.562.204.555.409.403.165-.123 2.696-1.827 3.124-2.119C10.125 19.758 11.043 20 12 20c5.514 0 10-3.582 10-8s-4.486-9-10-9z" fill="#3C1E1E"/>
                                        </svg>
                                    )}
                                </button>

                                {/* 링크 복사 */}
                                <button
                                    onClick={copyLink}
                                    className="w-10 h-10 rounded-full bg-surface-muted hover:bg-border flex items-center justify-center transition-colors group"
                                    title="링크 복사"
                                >
                                    {copied ? (
                                        <Check className="w-5 h-5 text-green-600" strokeWidth={2} />
                                    ) : (
                                        <Link className="w-5 h-5 text-content-primary" strokeWidth={2} />
                                    )}
                                </button>
                    </div>
                </div>
            </>
        )}
    </div>

            {/* 토스트 메시지 */}
            {showToast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
                    <div className="bg-surface px-5 py-3 rounded-full shadow-xl flex items-center gap-2.5 border-2 border-[#9333EA]">
                        <Check className="w-4 h-4 text-[#9333EA]" strokeWidth={3} />
                        <span className="text-sm font-semibold text-[#9333EA]">링크를 복사했어요.</span>
                    </div>
                </div>
            )}
            </>
        )
    }

    // 일반 모드
    return (
        <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
                <Share2 className="w-5 h-5 text-content-secondary" strokeWidth={1.8} />
                <h3 className="text-sm font-bold text-content-primary">이 이슈 공유하기</h3>
            </div>

            <div className="space-y-2">
                <button
                    onClick={() => handleShare('twitter')}
                    className="w-full px-4 py-2.5 bg-[#000000] text-white rounded-lg hover:bg-[#1a1a1a] transition-colors text-sm font-medium"
                >
                    X 공유
                </button>
                <button
                    onClick={() => handleShare('kakaotalk')}
                    className="w-full px-4 py-2.5 bg-[#FEE500] text-gray-900 rounded-lg hover:bg-[#fdd835] transition-colors text-sm font-medium"
                >
                    카카오톡 공유
                </button>
                <button
                    onClick={copyLink}
                    className="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center justify-center gap-2"
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4" />
                            <span>복사됨!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-4 h-4" />
                            링크 복사
                        </>
                    )}
                </button>
            </div>

            <div className="mt-3 pt-3 border-t border-border space-y-2">
                <p className="text-xs text-content-secondary break-all">{baseShareUrl}</p>
                <p className="text-xs text-content-muted">
                    공유 시 자동으로 유입 경로가 추적됩니다
                </p>
            </div>

            {/* 토스트 메시지 */}
            {showToast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
                    <div className="bg-surface px-5 py-3 rounded-full shadow-xl flex items-center gap-2.5 border-2 border-[#9333EA]">
                        <Check className="w-4 h-4 text-[#9333EA]" strokeWidth={3} />
                        <span className="text-sm font-semibold text-[#9333EA]">링크를 복사했어요.</span>
                    </div>
                </div>
            )}
        </div>
    )
}
