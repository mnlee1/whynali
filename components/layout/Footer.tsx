/**
 * components/layout/Footer.tsx
 *
 * [하단 푸터]
 *
 * 서비스명, 약관/정책 링크 영역. Tailwind만 사용.
 */

import Link from 'next/link'

export default function Footer() {
    return (
        <footer className="border-t border-border bg-surface mt-auto">
            <div className="container mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-content-secondary">
                    <span className="font-medium text-content-primary">왜난리</span>
                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
                        <Link href="/" className="hover:text-content-primary transition-colors">
                            홈
                        </Link>
                        <Link href="/community" className="hover:text-content-primary transition-colors">
                            커뮤니티
                        </Link>
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
                <p className="mt-3 text-center sm:text-left text-xs text-content-muted">
                    한국 이슈를 한눈에 파악하고 여론을 확인하세요
                </p>
                <p className="mt-1 text-center sm:text-left text-xs text-neutral-400">
                    © NHN AD. All rights reserved.
                </p>
            </div>
        </footer>
    )
}
