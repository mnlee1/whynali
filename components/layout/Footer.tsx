'use client'

/**
 * components/layout/Footer.tsx
 *
 * [하단 푸터]
 *
 * 서비스명, 약관/정책 링크, SNS 채널 아이콘 영역. Tailwind만 사용.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaInstagram, FaYoutube, FaThreads, FaXTwitter, FaTiktok } from 'react-icons/fa6'

const SNS_LINKS = [
    { href: 'https://www.instagram.com/why_nali/', label: '인스타그램', Icon: FaInstagram },
    { href: 'https://www.threads.com/@why_nali', label: '스레드', Icon: FaThreads },
    { href: 'https://x.com/whynali', label: 'X(트위터)', Icon: FaXTwitter },
    { href: 'https://www.youtube.com/@왜난리', label: '유튜브', Icon: FaYoutube },
    { href: 'https://www.tiktok.com/@whynali', label: '틱톡', Icon: FaTiktok },
]

export default function Footer() {
    // 이슈 상세 페이지는 모바일~xl 미만에서 화면 하단에 고정된 액션바(감정·투표·토론·댓글·공유)가
    // 떠 있어서, 스크롤을 끝까지 내리면 이 SNS 아이콘 줄을 가려버린다 — 그 페이지에서만 하단 여백을 더 준다.
    const pathname = usePathname()
    const isIssuePage = pathname?.startsWith('/issue/') ?? false

    return (
        <footer className="border-t border-border bg-surface mt-auto">
            <div className={`container mx-auto px-4 pt-6 ${isIssuePage ? 'pb-24 xl:pb-6' : 'pb-6'}`}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-content-secondary">
                    <Link href="/" className="font-medium text-content-primary hover:underline">
                        왜난리
                    </Link>
                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
                        <Link href="/terms" className="hover:text-content-primary transition-colors">
                            이용약관
                        </Link>
                        <Link href="/privacy" className="hover:text-content-primary transition-colors">
                            개인정보처리방침
                        </Link>
                        <a href="mailto:dl_deflow@nhnad.com" className="hover:text-neutral-900">
                            메일문의
                        </a>
                    </nav>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {SNS_LINKS.map(({ href, label, Icon }) => (
                            <a
                                key={label}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={label}
                                className="text-content-secondary hover:text-content-primary transition-colors"
                            >
                                <Icon size={18} />
                            </a>
                        ))}
                    </div>
                    <p className="text-xs text-neutral-400">© NHN AD. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}
